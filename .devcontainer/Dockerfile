# Use the official Node.js 18 image
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0-18

# Install Yeoman globally
RUN npm install -g yo typescript

# Install Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Set the working directory and install project dependencies
WORKDIR /workspaces/generator-caira
COPY package*.json ./
RUN npm install