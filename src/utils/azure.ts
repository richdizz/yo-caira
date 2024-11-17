import Generator from "yeoman-generator";
import { execSync } from "child_process";

// utility function to ensure Azure login and subscription
export async function ensureAzureLoginAndSubscription(generator:Generator) {
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
            const { subscriptionId } = await generator.prompt([
            {
                type: "list",
                name: "subscriptionId",
                message: "Select an Azure subscription:",
                choices: subscriptions,
            },
            ]);
    
            // Set the selected subscription
            execSync(`az account set --subscription ${subscriptionId}`);
            return subscriptionId;
        }
    
        return currentSubscription;
    } catch (error) {
        console.error("Error ensuring Azure login and subscription:", error);
        throw error;
    }
}