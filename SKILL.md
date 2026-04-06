---
name: ClawKitchen
version: 0.3.44
description: "Local-first web UI for OpenClaw. Visual recipe editor, team dashboards, workflow monitoring, and agent management."
homepage: https://github.com/JIGGAI/clawkitchen  
metadata:
  openclaw:
    emoji: "🍳"
    requires:
      bins: ["node"]
    tags: ["ui", "dashboard", "kitchen", "recipes", "teams", "workflows", "monitoring", "web"]
---

# ClawKitchen Plugin

**ClawKitchen** is a local-first web UI plugin for OpenClaw that provides visual management and authoring tools for ClawRecipes recipes, agents, and teams.

## What it does

- **Visual Recipe Editor**: Create and edit ClawRecipes using a web interface
- **Team Dashboard**: Monitor agent teams, workflows, and execution status  
- **Agent Management**: Configure agent identities, tools, and settings
- **Workflow Visualization**: Track workflow runs and approvals in real-time
- **Local-First**: Runs entirely on your machine, no cloud dependencies

## Installation

```bash
openclaw plugins install @jiggai/kitchen
```

## Usage

After installation, ClawKitchen runs as a Next.js web application integrated with OpenClaw:

1. Install the plugin
2. Access the Kitchen UI through OpenClaw
3. Create and manage recipes visually
4. Monitor your agent teams and workflows

## Features

- ✅ Visual recipe authoring and editing
- ✅ Real-time team and workflow monitoring  
- ✅ Agent configuration management
- ✅ Workflow approval interface
- ✅ Goal and ticket tracking
- ✅ Local-first architecture
- ✅ ClawRecipes integration

## Use Cases

- **Recipe Development**: Visually create and test new agent recipes
- **Team Monitoring**: Track multi-agent team performance and workflows
- **Workflow Management**: Handle approvals and monitor execution pipelines
- **Agent Configuration**: Easily configure agent identities and capabilities
- **Project Management**: Track goals, tickets, and team progress

## Requirements

- OpenClaw 2026.3.x or later
- ClawRecipes plugin (automatically installed)
- Node.js 22+
- Modern web browser

## Documentation

Full documentation available at: https://github.com/JIGGAI/clawkitchen

## Support

- GitHub Issues: https://github.com/JIGGAI/clawkitchen/issues  
- Discord: https://discord.gg/qDREsrXKzj