# \#\# On-Demand Fargate Test Runner API

A Node.js REST API for orchestrating on-demand, serverless testing environments on **AWS Fargate** using Docker.

-----

## \#\# Overview

This project provides a RESTful API that acts as a control plane for running automated tests in ephemeral, isolated environments. It solves the problem of maintaining costly, always-on CI build servers by providing an API to dynamically launch Docker containers on AWS Fargate.

Users can trigger a workflow with a specific Git repository and command, and the system will provision the necessary resources, execute the tests, stream logs to CloudWatch, and terminate the infrastructure upon completion.

-----

## \#\# Key Features

  * **On-Demand Execution**: Workflows are triggered via a simple REST API call.
  * **Serverless Compute**: Leverages **AWS Fargate** to run containers without managing servers.
  * **Isolated Environments**: Each test runs in its own fresh Docker container, ensuring no conflicts.
  * **Dynamic Configuration**: A single container image can test any repository by passing parameters through the API.
  * **Infrastructure as Code (IaC)**: The entire supporting AWS infrastructure is managed by **Terraform**.
  * **Auto-Discovery**: The API automatically discovers required networking resources (subnets, security groups) using AWS tags.

-----


## \#\# Technology Stack

  * **Backend**: Node.js, Express.js
  * **Cloud Provider**: AWS
  * **Core Services**: Fargate, ECS, ECR, VPC, CloudWatch, IAM
  * **Infrastructure as Code**: Terraform
  * **Containerization**: Docker

-----

## \#\# Setup and Installation

### \#\#\# Prerequisites

  * Node.js (v18 or higher)
  * npm
  * AWS CLI (configured with credentials)
  * Terraform
  * Docker

### \#\#\# 1. Configure Environment

Create a `.env` file in the root of the project and populate it with your AWS resource details.

*Note: The `SUBNET_ID` and `SECURITY_GROUP_ID` are discovered automatically by the application using resource tags.*

### \#\#\# 2. Install Dependencies

```bash
npm install
```

### \#\#\# 3. Run the Server

```bash
npm start
```

The API server will start and log a message that it is running on port 3000.

-----

## \#\# API Usage

### \#\#\# Endpoints

  * `POST /workflow/execute`: Starts a new test workflow.
  * `GET /workflow/{id}/status`: Checks the status of a workflow.
  * `DELETE /workflow/{id}`: Cancels a running workflow.

### \#\#\# Example Requests

#### **Start a Workflow**

```bash
curl -X POST http://localhost:3000/workflow/execute \
-H "Content-Type: application/json" \
-d '{
  "repo_url": "https://github.com/your-username/sample-test-repo.git",
  "branch": "main",
  "test_command": "npm test"
}'
```

#### **Check Workflow Status**

Replace `{workflow_id}` with the ID returned from the previous command.

```bash
curl http://localhost:3000/workflow/{workflow_id}/status
```

#### **Cancel a Workflow**

```bash
curl -X DELETE http://localhost:3000/workflow/{workflow_id}
```
