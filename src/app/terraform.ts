import { execSync } from "child_process";

// utility to run terraform
export function runTerraform() {
  try {
    // Initialize and apply Terraform, assuming `main.tf` is in your directory
    execSync("terraform init", { stdio: "inherit" });
    execSync(`terraform apply -var-file="terraform.tfvars" -auto-approve`, { stdio: "inherit" });
  } catch (error) {
    console.error("Error running Terraform:", error);
  }
}

// utility to get terraform output
export function getTerraformOutput(): Record<string, any> {
  try {
    const output = execSync("terraform output -json", { stdio: "inherit" });
    return JSON.parse(output.toString());
  } catch (error) {
    console.error("Error getting Terraform output:", error);
    return {};
  }
}