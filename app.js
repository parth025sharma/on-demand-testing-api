import dotenv from 'dotenv';
dotenv.config()

import express from 'express';
import { EC2Client, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";
import { ECSClient, RunTaskCommand, DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { randomUUID } from 'crypto';


const AWS_REGION = process.env.AWS_REGION;
const ECS_CLUSTER_NAME = process.env.ECS_CLUSTER_NAME;
const ECS_TASK_DEFINITION_ARN = process.env.ECS_TASK_DEFINITION_ARN;
const SECURITY_GROUP_ID = process.env.SECURITY_GROUP_ID;
const CONTAINER_NAME = process.env.CONTAINER_NAME;
const PORT = process.env.PORT || 3000; 


let SUBNET_ID;

async function getNetworkConfiguration() {
    const ec2Client = new EC2Client({ region: AWS_REGION });
    const tagFilter = { Name: "tag:Name", Values: ["playwright-ecs-cluster-public-0"] };

    console.log("Discovering network configuration by tag 'Name: playwright-ecs-cluster-public-0'...");

    const describeSubnetsCommand = new DescribeSubnetsCommand({ Filters: [tagFilter] });
    const subnetResponse = await ec2Client.send(describeSubnetsCommand);
    if (!subnetResponse.Subnets || subnetResponse.Subnets.length === 0) {
        throw new Error("Could not find any subnets with the tag 'purpose: fargate-runner'");
    }
    
    SUBNET_ID = subnetResponse.Subnets[0].SubnetId;
    console.log(`Found Subnet: ${SUBNET_ID}`);
}

const app = express();
app.use(express.json());

const ecsClient = new ECSClient({ region: AWS_REGION });

const workflowStore = {};

app.post('/workflow/execute', async (req, res) => {
    const { repo_url, branch, test_command } = req.body;

    if (!repo_url || !branch || !test_command) {
        return res.status(400).json({ error: 'Missing required parameters: repo_url, branch, test_command' });
    }
    
    const commandParams = {
        cluster: ECS_CLUSTER_NAME,
        taskDefinition: ECS_TASK_DEFINITION_ARN,
        launchType: 'FARGATE',
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: [SUBNET_ID],
                securityGroups: [SECURITY_GROUP_ID],
                assignPublicIp: 'ENABLED',
            },
        },
        overrides: {
            containerOverrides: [{
                name: CONTAINER_NAME,
                environment: [
                    { name: 'REPO_URL', value: repo_url },
                    { name: 'BRANCH', value: branch },
                    { name: 'TEST_COMMAND', value: test_command },
                ],
            }],
        },
    };

    try {
        const command = new RunTaskCommand(commandParams);
        const data = await ecsClient.send(command);

        if (data.tasks && data.tasks.length > 0) {
            const taskArn = data.tasks[0].taskArn;
            const workflowId = randomUUID();

            // Store the mapping
            workflowStore[workflowId] = taskArn;
            console.log(`[SUCCESS] Started workflow ${workflowId} with Task ARN: ${taskArn}`);

            return res.status(202).json({
                message: 'Workflow execution started successfully.',
                workflow_id: workflowId,
                task_arn: taskArn,
            });
        } else {
            console.error('[ERROR] Fargate task did not start.', data.failures);
            return res.status(500).json({ error: 'Failed to start Fargate task.', details: data.failures });
        }
    } catch (error) {
        console.error('[ERROR] AWS SDK error:', error);
        return res.status(500).json({ error: 'Failed to execute workflow.', details: error.message });
    }
});


app.get('/workflow/:id/status', async (req, res) => {
    const { id } = req.params;
    const taskArn = workflowStore[id];

    if (!taskArn) {
        return res.status(404).json({ error: 'Workflow not found.' });
    }

    const command = new DescribeTasksCommand({
        cluster: ECS_CLUSTER_NAME,
        tasks: [taskArn],
    });

    try {
        const data = await ecsClient.send(command);
        if (data.tasks && data.tasks.length > 0) {
            const task = data.tasks[0];
            return res.json({
                workflow_id: id,
                status: task.lastStatus,
                desired_status: task.desiredStatus,
                created_at: task.createdAt,
                stopped_at: task.stoppedAt,
                stopped_reason: task.stoppedReason,
            });
        } else {
            return res.status(404).json({ error: 'Task details not found.' });
        }
    } catch (error) {
        console.error('[ERROR] AWS SDK error:', error);
        return res.status(500).json({ error: 'Failed to get workflow status.', details: error.message });
    }
});


app.delete('/workflow/:id', async (req, res) => {
    const { id } = req.params;
    const taskArn = workflowStore[id];

    if (!taskArn) {
        return res.status(404).json({ error: 'Workflow not found.' });
    }

    const command = new StopTaskCommand({
        cluster: ECS_CLUSTER_NAME,
        task: taskArn,
        reason: 'Workflow cancelled by API request.',
    });

    try {
        await ecsClient.send(command);
       
        delete workflowStore[id];

        console.log(`[SUCCESS] Stopped workflow ${id}`);
        return res.status(200).json({ message: 'Workflow cancellation request sent.' });
    } catch (error) {
        console.error('[ERROR] AWS SDK error:', error);
        return res.status(500).json({ error: 'Failed to stop workflow.', details: error.message });
    }
});


async function main() {
    try {
        await getNetworkConfiguration();
        
        app.listen(PORT, () => {
            console.log(`API server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1); 
    }
}

main();