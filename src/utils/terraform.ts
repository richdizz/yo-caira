import { execSync } from "child_process";

// utility to init terraform
export function initTerraform() {
  try {
    // Initialize Terraform, assuming `main.tf` is in your directory
    execSync("terraform init", { stdio: "inherit" });
  } catch (error) {
    console.error("Error running Terraform:", error);
  }
}

// utility to plan terraform
export function planTerraform() {
  try {
    // Plan Terraform, assuming `main.tf` is in your directory
    execSync(`terraform plan -var-file="terraform.tfvars"`, { stdio: "inherit" });
  } catch (error) {
    console.error("Error running Terraform:", error);
  }
}

// utility to run terraform
export function applyTerraform() {
  try {
    // Apply Terraform, assuming `main.tf` is in your directory
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