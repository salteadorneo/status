import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './yaml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manages GitHub issues for service status changes
 * To be run by GitHub Actions with github-script
 */
export async function manageIssues(github, context) {
  let config;
  const yamlPath = path.join(__dirname, 'config.yml');
  const jsonPath = path.join(__dirname, 'config.json');
  
  if (fs.existsSync(yamlPath)) {
    const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = parseYAML(yamlContent);
    config = {
      services: (parsed.checks || parsed.services || []).map((check) => ({
        id: check.id || check.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: check.name,
        url: check.url
      }))
    };
  } else {
    config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }
  
  for (const service of config.services) {
    const statusPath = path.join(__dirname, 'api', service.id, 'status.json');
    if (!fs.existsSync(statusPath)) continue;
    
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    const issueTitle = `🔴 ${service.name} is down`;
    
    // Get existing issues with incident label
    const issues = await github.rest.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      labels: 'incident',
      state: 'open'
    });
    
    const existingIssue = issues.data.find(issue => 
      issue.title === issueTitle
    );
    
    if (status.status === 'down' && !existingIssue) {
      // Service is down, create issue
      const body = `## 🔴 Service Down Alert

**Service:** ${service.name}
**URL:** ${service.url}
**Status:** Down
**Timestamp:** ${status.timestamp}
**Error:** ${status.error || 'Unknown error'}
${status.statusCode ? `**Status Code:** ${status.statusCode}` : ''}
**Response Time:** ${status.responseTime}ms

---

This issue was automatically created by the status monitor.
The service will be checked every 10 minutes.`;

      const issue = await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: issueTitle,
        body: body,
        labels: ['incident', 'automated']
      });
      
      console.log(`✓ Created issue #${issue.data.number} for ${service.name}`);
      
    } else if (status.status === 'up' && existingIssue) {
      // Service is back up, close issue
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: existingIssue.number,
        body: `✅ **Service Recovered**

The service is back online and operational.

**Timestamp:** ${status.timestamp}
**Response Time:** ${status.responseTime}ms

---

Automatically resolved by the status monitor.`
      });
      
      await github.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: existingIssue.number,
        state: 'closed'
      });
      
      console.log(`✓ Closed issue #${existingIssue.number} for ${service.name}`);
    }
  }
}

// For direct execution in GitHub Actions
if (process.env.GITHUB_ACTIONS) {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  const context = {
    repo: {
      owner: process.env.GITHUB_REPOSITORY.split('/')[0],
      repo: process.env.GITHUB_REPOSITORY.split('/')[1]
    }
  };
  
  await manageIssues(octokit, context);
}
