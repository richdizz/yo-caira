import Generator from "yeoman-generator";
import { ensureAzureLoginAndSubscription } from "../utils/azure";
import { writeTextFile } from "../utils/file";
const download = require("download-git-repo");
import { initTerraform, planTerraform, applyTerraform, getTerraformOutput } from "../utils/terraform";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

interface PromptAnswers {
  personalAccessToken: string;
  referenceArchitecture: string;
  projectName: string;
  customDomainName: string;
  certificatePath: string;
  certificatePassword: string;
  // TODO: make this dynamic based on the RA configuration
}

interface ConfigureAnswers {
  performApply: boolean;
  domainStuffComplete: boolean;
}

class CairaGenerator extends Generator {
  promptAnswers!: PromptAnswers;
  configAnswers!: ConfigureAnswers;
  private terraformOutput: Record<string, any> = {};
  constructor(args: string | string[], options: {}) {
    super(args, options);
  };

  // 1. Prompt the user for the reference architecture and project name
  async prompting() {
    const chalk = (await import("chalk")).default;

    // Prompt welcome message
    this.log("");
    this.log(chalk.blue("----------------------------------------"));
    this.log(chalk.blue("Welcome to the CAIRA Yeoman Generator!"));
    this.log(chalk.blue("----------------------------------------"));

    // Prompt PAT warning
    this.log("");
    this.log(chalk.red("!!! The CAIRA repository is currently set to private. A personal access token (PAT) with access to CAIRA is required to use this generator"));
    this.log("");

    // Prompt for personalAccessToken
    this.promptAnswers = await this.prompt([
      {
        type: "password",
        name: "personalAccessToken",
        message: chalk.reset.blue("What is your PAT with CAIRA access?")
      }
    ]);

    // TODO: test the PAT to ensure it has access to the CAIRA repo

    // TODO: dynamically query available reference architectures
    // We could look for RAs with a yo.json in root, which would include config for the RA with yeoman

    // Prompt user for input
    this.promptAnswers = await this.prompt([
      {
        type: "list",
        name: "referenceArchitecture",
        message: chalk.reset.blue("Please select a CAIRA Reference Architecture:"),
        choices: ["SecureAML", "Secure Teams CoPilot"],
      },
      {
        type: "input",
        name: "projectName",
        message: chalk.reset.blue("What is your project name?"),
        default: "my-project"
      },
      {
        type: "input",
        name: "customDomainName",
        message: chalk.reset.blue("What is domainname for your project?"),
        default: "bot.contoso.com"
      },
      {
        type: "input",
        name: "certificatePath",
        message: chalk.reset.blue("What is path to the certificate for app service?"),
        default: "~/repos/certs/cert.pfx"
      },
      {
        type: "password",
        name: "certificatePassword",
        message: chalk.reset.blue("What is password of the certificate?"),
      }
    ]);
  };

  // 2. Configure the project
  async configuring() {
    const chalk = (await import("chalk")).default;

    // ensure Azure login and subscription
    this.log("Checking Azure subscription...");
    const subscriptionId = await ensureAzureLoginAndSubscription(this);
    this.log("Subscription ID:", subscriptionId);

    // TODO: add additional variables
    // generate TF file locally that uses GitHub as a Terraform Module Source
    await writeTextFile(process.cwd(), "terraform.tfvars", `environment = \"${this.promptAnswers.projectName}\"`)
    await writeTextFile(process.cwd(), "main.tf", `module \"remote_caira\" { \nsource = \"git::https://${this.promptAnswers.personalAccessToken}@github.com/microsoft/CAIRA.git//reference_architectures/secure_teams_copilot?ref=sandervd/greenThread_2\" \nenvironment = var.environment \n}\n\nvariable "environment" {}`)

    // init and plan terraform
    this.log("Initializing Terraform...");
    initTerraform();
    this.log("Planning Terraform...");
    planTerraform();

    // Prompt the user to confirm the plan
    this.configAnswers = await this.prompt([
      {
        type: "confirm",
        name: "performApply",
        message: chalk.reset.blue("Please review the Terraform plan. Do you want to apply it?")
      }
    ]);

    // only contine if user confirmed to apply
    if (this.configAnswers.performApply) {
      // apply the terraform
      applyTerraform();

      // capture and log the Terraform output
      this.terraformOutput = getTerraformOutput();
      this.log(this.terraformOutput);

      // Get the verification Id for the custom domain
      const verificationId = execSync(`az webapp show --resource-group ${this.terraformOutput.resource_group_name.value} --name ${this.terraformOutput.app_service_name.value} --query customDomainVerificationId --output json`, { encoding: "utf8" });

      // Output domain instructions to user
      this.log("");
      this.log(chalk.blue("----------------------------------------"));
      this.log(chalk.blue(`Terraform has been applied to subscription ${subscriptionId}.`));
      this.log(chalk.blue("----------------------------------------"));
      this.log("");
      this.log(chalk.red(`Before continuing, you must complete the following steps:\n    - Create TXT record using verification id ${verificationId}\n    - Create A-Record with IP Address: "${this.terraformOutput.firewall_pip.value}"`));
      this.log("");

      // Prompt the user to do custom domain stuff
      this.configAnswers = await this.prompt([
        {
          type: "confirm",
          name: "domainStuffComplete",
          message: chalk.reset.red(`Have you completed the custom domain configuration steps outlined above?`)
        },
      ]);

      this.log("Setting the custom domain to the Bot App Service Web App ...");
      const setCustomDomain = execSync(`az webapp config hostname add --resource-group ${this.terraformOutput.resource_group_name.value} --webapp-name ${this.terraformOutput.app_service_name.value} --hostname ${this.promptAnswers.customDomainName}`);

      this.log("Uploading the certificate to the Bot App Service Web App ...");
      const certUpload = execSync(`az webapp config ssl upload --resource-group ${this.terraformOutput.resource_group_name.value} --name ${this.terraformOutput.app_service_name.value} --certificate-file ${this.promptAnswers.certificatePath} --certificate-password ${this.promptAnswers.certificatePassword}`);

      this.log("Get the thumbprint of the uploaded certificate ...");
      const thumbprint = execSync(`az webapp config ssl list --resource-group ${this.terraformOutput.resource_group_name.value} --query "[?hostNames[0]=='${this.promptAnswers.customDomainName}"].thumbprint" --output json`, { encoding: "utf8" });
      
      this.log("Bind the uploaded certificate to the Bot App Service Web App ...");
      const certBind = execSync(`az webapp config ssl bind --resource-group ${this.terraformOutput.resource_group_name.value} --name ${this.terraformOutput.app_service_name.value} --certificate-thumbprint ${JSON.parse(thumbprint)[0]} --ssl-type SNI`);
      
      this.log("Set the endpoint for the custom domain to azure bot service endpoint ...");
      const botendpointchange = execSync(`az bot update --resource-group ${this.terraformOutput.resource_group_name.value} --name ${this.terraformOutput.bot_service_name.value} --endpoint https://${this.promptAnswers.customDomainName}/api/messages`, { stdio: "inherit" });
    
      this.log("Generating VPN client configuration for the virtual network gateway ...");
      const vpnClientConfig = execSync(`az network vnet-gateway vpn-client generate --resource-group ${this.terraformOutput.resource_group_name.value} --name ${this.terraformOutput.vnet_gateway_name.value} --output xml`, { encoding: "utf8" });
      const vpnClientConfigPath = path.join(__dirname, "vpnClientConfig.xml");
      // Save the VPN client configuration to a file
      fs.writeFileSync(vpnClientConfigPath, vpnClientConfig);
      this.log(`VPN client configuration saved to ${vpnClientConfigPath}`);
    }
  };
  

  // 3. Write the files
  async writing() {
    const chalk = (await import("chalk")).default;

    // Define GitHub repo and destination path
    const repoUrl = "github:svandenhoven/BasicAIBot";
    const destination = this.destinationPath(`${process.cwd()}/${this.promptAnswers.projectName}`);//this.promptAnswers.projectName);

    this.log("Cloning the template repository...");

    // Clone the GitHub repository
    await new Promise<void>((resolve, reject) => {
      download(repoUrl, destination, (err:any) => {
        if (err) {
          this.log("Error downloading the repository:", err);
          reject(err);
        } else {
          this.log("Repository downloaded successfully!");
          resolve();
        }
      });
    });

    // Update package.json with project name
    const packageJsonPath = path.join(destination, "package.json");
    let packageJson:any = {};
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    }
    packageJson.name = this.promptAnswers.projectName;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), "utf8");

    // TODO: Update other files such as .env and teamsapp.yaml
  };

  // 4. Install dependencies
  async install() {
    const chalk = (await import("chalk")).default;
    const subfolderPath = path.join(process.cwd(), this.promptAnswers.projectName);
    
    this.log(`Running npm install in ${subfolderPath}...`);
    // Run npm install in the copied folder
    this.spawnCommandSync("npm", ["install"], { cwd: subfolderPath });
  }

  // 5. End
  async end() {
    const chalk = (await import("chalk")).default;
    this.log(chalk.blue("Generator finished successfully!"));
  };
}

module.exports = CairaGenerator;