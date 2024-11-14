# Yo CAIRA
This is an experimental project to develop a Yeoman generator that can bring together CAIRA provisioning scripts with a starter project template to deliver a target green thread experience for engineers.

## Pre-requisites
The following are pre-requisites to run yo caira.

- Node (v18)
- NPM
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/)
- Typescript


# Running the generator
1. Clone the repository
2. Install Yeoman globally using npm
```
npm install -g yo
```
3. Create a global symlink for the generator via npm so Yeoman can find it
```
npm link
```
4. Run the generator
```
yo caira
```
5. Follow the prompts in the generator
6. When the generator completes, change directories to the destination project folder and give the terminal permission to run the deploy.sh file
```
chmod +x deploy.sh
```
7. Run the deploy.sh file from the terminal
```
.\deploy.sh
```