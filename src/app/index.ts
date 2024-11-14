import Generator from "yeoman-generator";
const download = require("download-git-repo");
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { runTerraform, getTerraformOutput } from "./terraform";
import { Console } from "console";

interface PromptAnswers {
  referenceArchitecture: string;
  projectName: string;
}

interface HumanWorkflowCheckpoints {
  domainStuffComplete: boolean;
}

class CairaGenerator extends Generator {
  answers!: PromptAnswers;
  humanWorkflow!: HumanWorkflowCheckpoints;
  private terraformOutput: Record<string, any> = {};
  constructor(args: string | string[], options: {}) {
    super(args, options);
  };

  // utility function to write text files
  writeTextFile = async (destinationPath: string, fileName: string, content: string) => {
    const filePath = path.join(destinationPath, fileName);
    await fs.writeFileSync(filePath, content, "utf8");
  };

  // utility function to ensure Azure login and subscription
  ensureAzureLoginAndSubscription = async () => {
    try {
      // Check if logged in and retrieve subscriptions
      const subscriptionsOutput = execSync("az account list --query '[].id' -o tsv", { encoding: "utf8" });
      const subscriptions = subscriptionsOutput.trim().split("\n");
  
      if (subscriptions.length === 0) {
        // No subscriptions available, ask user to login
        console.log("No Azure subscriptions found. Please log in to Azure.");
        execSync("az login", { stdio: "inherit" });
      }
  
      // Check if a subscription is set
      let currentSubscription = execSync("az account show --query 'id' -o tsv", { encoding: "utf8" }).trim();
      if (!currentSubscription) {
        // Prompt user to select a subscription if not set
        const { subscriptionId } = await this.prompt([
          {
            type: "list",
            name: "subscriptionId",
            message: "Select an Azure subscription:",
            choices: subscriptions,
          },
        ]);
  
        // Set the selected subscription
        execSync(`az account set --subscription ${subscriptionId}`);
        currentSubscription = subscriptionId;
      }
  
      return currentSubscription;
    } catch (error) {
      console.error("Error ensuring Azure login and subscription:", error);
      throw error;
    }
  }

  // 1. Prompt the user for the reference architecture and project name
  async prompting() {
    this.log("Welcome to the CAIRA Yeoman Generator!");

    // TODO: dynamically query available reference architectures

    // Ask which reference architecture to use
    this.answers = await this.prompt([
      {
        type: "list",
        name: "referenceArchitecture",
        message: "Please select a CAIRA Reference Architecture:",
        choices: ["SecureAML", "Secure Teams CoPilot"],
      },
    ]);

    // Ask for project name
    this.answers = await this.prompt([
      {
        type: "input",
        name: "projectName",
        message: "What is your project name?",
        default: "my-project"
      }
    ]);
  };

  // 2. Configure the project
  async configuring() {
    // ensure Azure login and subscription
    this.log("Checking Azure subscription...");
    const subscriptionId = await this.ensureAzureLoginAndSubscription();
    console.log("Subscription ID:", subscriptionId);

    // generate TF file locally that uses GitHub as a Terraform Module Source
    await this.writeTextFile(process.cwd(), "terraform.tfvars", `subscription_id = \"${subscriptionId}\"\nprefix = \"${this.answers.projectName}\"`)
    await this.writeTextFile(process.cwd(), "main.tf", `module \"remote_caira\" { \nsource = \"github.com/richdizz/yo-test-terraform\" \nsubscription_id = var.subscription_id \nprefix = var.prefix \n}\n\nvariable "subscription_id" {}\nvariable "prefix" {}`)

    console.log("Terraform written");

    // run the Terraform
    runTerraform();

    // capture and log the Terraform output
    this.terraformOutput = getTerraformOutput();
    console.log(this.terraformOutput);

    // Prompt the user to do custom domain stuff
    this.humanWorkflow = await this.prompt([
      {
        type: "confirm",
        name: "domainStuffComplete",
        message: "The Terraform process completed. Here we could pause for user to complete custom domain stuff now. Are you done?"
      },
    ]);
  };

  // 3. Write the files
  async writing() {
    // Define GitHub repo and destination path
    const repoUrl = "github:richdizz/yo-test-api";
    const destination = this.destinationPath(`${process.cwd()}/${this.answers.projectName}`);//this.answers.projectName);

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

    // Update package.json or other files in the cloned repository
    const packageJsonPath = path.join(destination, "package.json");

    // Read the current contents of package.json
    let packageJson:any = {};
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    }

    // Update the package.json data
    packageJson.name = this.answers.projectName;

    // Write the modified package.json back to the file without triggering conflict detection
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), "utf8");

    // add deployment script to project
    await this.writeTextFile(`${process.cwd()}/${this.answers.projectName}`, "deploy.sh", `#!/bin/bash\n\n# Variables\nRESOURCE_GROUP="${this.answers.projectName}rgrichdizz"\nAPP_SERVICE_NAME="${this.answers.projectName}asrichdizz"\n\n# Login to Azure if needed\naz login\n\n# Stop the app if it’s already running\necho "Stopping the app..."\naz webapp stop --resource-group $RESOURCE_GROUP --name $APP_SERVICE_NAME\n\n# Create a zip file of the current directory\nzip -r app.zip .\n\naz webapp deploy \\\n  --resource-group $RESOURCE_GROUP \\\n  --name $APP_SERVICE_NAME \\\n  --src-path app.zip \\\n  --type zip \\\n  --clean  &\n\necho "Deployment command initiated. Waiting for deployment completion..."\n\n# Wait for deployment to finish\nwait\n\n# Clean up the zip file\nrm app.zip\n\n# Start the app to ensure it's running\necho "Starting the app..."\naz webapp start --resource-group $RESOURCE_GROUP --name $APP_SERVICE_NAME\n\necho "Deployment completed and app is running!"`);
  };

  // 4. Install dependencies
  async install() {
    const subfolderPath = path.join(process.cwd(), this.answers.projectName);
    
    this.log(`Running npm install in ${subfolderPath}...`);
    // Run npm install in the copied folder
    this.spawnCommandSync('npm', ['install'], { cwd: subfolderPath });
  }

  // 5. End
  end() {
    this.log("Generator finished successfully!");
  };
}

module.exports = CairaGenerator;