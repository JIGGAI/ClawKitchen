# Workflow Visual Editor

## Overview

ClawKitchen's workflow visual editor is the primary interface for creating, editing, and managing team workflows. It provides a drag-and-drop interface for building complex automation workflows without writing JSON by hand.

## Creating a New Workflow

### From Template
1. Navigate to your team's **Workflows** page
2. Click **"Add Example Workflow Template"**
3. Choose from available templates (e.g., "Marketing Content Pipeline")
4. The template is added to your team workspace and opens in the editor

### From Scratch
1. Navigate to your team's **Workflows** page  
2. Click **"Create New Workflow"**
3. Enter a workflow name and ID
4. Click **"Create"** to open the blank workflow in the editor

## Visual Editor Interface

### Canvas
The main editing area where you build your workflow graph:
- **Drag and drop** nodes from the node palette
- **Connect nodes** by dragging from output ports to input ports  
- **Pan** by dragging empty canvas space
- **Zoom** using mouse wheel or zoom controls

### Node Palette
Located on the left side, organized by category:
- **Start/End**: `start`, `end` nodes for workflow structure
- **Logic**: `llm` nodes for AI-powered content generation
- **Actions**: `tool` nodes for executing commands and actions
- **Media**: `media-image`, `media-video`, `media-audio` for content generation
- **Human**: `human_approval` nodes for manual review steps
- **Output**: `writeback` nodes for saving results

### Properties Panel
Located on the right side when a node is selected:
- **Basic Settings**: Node ID, display name, description
- **Configuration**: Node-specific settings and parameters
- **Input/Output**: Configure data flow between nodes

## Working with Nodes

### Adding Nodes
1. **Drag from palette**: Drag a node type from the left palette onto the canvas
2. **Quick add**: Double-click empty canvas space to open node selection dialog
3. **Copy/paste**: Select existing nodes and use Ctrl+C / Ctrl+V

### Configuring Nodes
Select a node to open its properties panel:

#### LLM Nodes
- **Agent Assignment**: Choose which team agent executes this node
- **Prompt**: Either inline prompt text or path to prompt template file
- **Model Override**: Optional model selection (overrides workflow default)
- **Output Format**: JSON schema or expected output structure

#### Tool Nodes  
- **Agent Assignment**: Choose executing agent
- **Tool Selection**: Choose from available tools (fs.append, outbound.post, message, etc.)
- **Parameters**: Configure tool-specific arguments
- **Error Handling**: Define behavior on tool failure

#### Media Nodes
- **Agent Assignment**: Choose executing agent  
- **Media Type**: image, video, or audio
- **Prompt Source**: Inline prompt or upstream node output
- **Provider Settings**: Auto-discovered from available skills

#### Human Approval Nodes
- **Agent Assignment**: Choose approver
- **Approval Binding**: Select configured approval channel/method
- **Instructions**: Custom approval prompt text
- **Timeout**: Optional approval deadline

### Connecting Nodes
Create edges between nodes to define execution flow:

1. **Hover over node** to see output ports (small circles on node edges)
2. **Drag from output port** to input port of target node
3. **Set edge conditions**: Choose success, error, or always
4. **Multiple connections**: Nodes can have multiple incoming and outgoing edges

#### Edge Types
- **Success** (green): Execute target node only if source succeeds
- **Error** (red): Execute target node only if source fails  
- **Always** (blue): Execute target node regardless of source outcome

## Advanced Features

### Template Variables
Use template variables in node configurations:
- `{{run.id}}`: Current workflow run ID
- `{{workflow.id}}`: Workflow identifier
- `{{date}}`: Current date/time
- `{{upstream_node.output}}`: Output from previous nodes

### Node Dependencies
Configure complex dependencies in the properties panel:
- **Input From**: Specify which upstream nodes this node waits for
- **Data Binding**: Map specific output fields from upstream nodes
- **Conditional Logic**: Use edge conditions for branching workflows

### Workflow Settings
Access via the gear icon in the top toolbar:
- **General**: Workflow name, description, default model
- **Triggers**: Configure cron schedules or manual triggers
- **Approvals**: Set up approval bindings and notification channels
- **Variables**: Define workflow-level template variables

## Workflow Templates

### Marketing Content Pipeline
Complete pipeline for content creation and distribution:
1. **Draft Content** (LLM) → Generate marketing copy
2. **Generate Visuals** (Media-Image) → Create supporting images  
3. **Human Review** (Approval) → Manual content review
4. **Publish** (Tool) → Post to social media platforms

### Documentation Update
Automated documentation maintenance workflow:
1. **Scan Changes** (Tool) → Check for code/feature changes
2. **Draft Updates** (LLM) → Generate documentation updates
3. **Review** (Approval) → Human review and approval
4. **Commit** (Tool) → Update documentation files

### Customer Support Escalation  
Automated support ticket processing:
1. **Analyze Ticket** (LLM) → Categorize and assess urgency
2. **Route Decision** (branching edges) → Different paths based on priority
3. **Auto-Response** (Tool) → Send initial customer response
4. **Human Handoff** (Approval) → Transfer to human agent if needed

## Best Practices

### Workflow Design
- **Start simple**: Begin with linear workflows before adding complexity
- **Use descriptive names**: Clear node IDs and descriptions improve maintainability  
- **Add error handling**: Include error paths for critical operations
- **Document dependencies**: Note external requirements in workflow description

### Node Configuration
- **Test incrementally**: Use manual runs to test individual node configurations
- **Use templates**: Leverage prompt templates for reusable content
- **Monitor outputs**: Check node output files to debug issues
- **Set timeouts**: Configure appropriate timeouts for long-running operations

### Team Collaboration
- **Consistent naming**: Establish team conventions for node and workflow naming
- **Version control**: Workflow files are stored in git for change tracking
- **Document workflows**: Add descriptions explaining workflow purpose and usage
- **Share templates**: Create reusable workflow templates for common patterns

## Troubleshooting

### Common Issues

**Node Not Executing**
- Check agent assignment is valid
- Verify all required parameters are configured
- Check incoming edge conditions are satisfied
- Review run logs in the Runs page

**LLM Node Failures**  
- Verify llm-task plugin is available
- Check model configuration and availability
- Review prompt template syntax
- Ensure agent has appropriate permissions

**Tool Node Errors**
- Verify tool availability in current environment
- Check parameter formatting and values
- Review tool-specific documentation
- Test tool independently via CLI

**Approval Timeouts**
- Check approval binding configuration
- Verify notification delivery
- Review approval channel accessibility
- Consider increasing timeout values

### Debugging Workflows
1. **Use Run Detail pages**: Inspect individual run execution
2. **Check node outputs**: Review generated content and data
3. **Monitor logs**: Look for error messages and execution traces
4. **Test manually**: Use "Run Now" to test workflow changes
5. **Simplify temporarily**: Remove complex nodes to isolate issues

## Integration Points

### With ClawRecipes
- Workflows are stored as `.workflow.json` files in team workspace
- Visual editor generates valid ClawRecipes workflow format
- Changes sync automatically with file system
- Compatible with ClawRecipes CLI tools

### With Team Management
- Agent assignments use team member definitions
- Approval bindings connect to team communication channels
- Workflow permissions inherit from team access controls
- Shared templates available across team workspaces

### With External Tools
- Tool nodes integrate with OpenClaw tool ecosystem
- Media nodes auto-discover available generation skills
- Approval nodes connect to configured messaging platforms
- Output nodes can trigger external webhooks or APIs

This visual editor makes workflow creation accessible while maintaining the power and flexibility of the underlying ClawRecipes format.

## Handoff nodes and account pickers

Handoff nodes (`type: "handoff"`) hand control off to a different workflow, optionally in a different team. When the target is a **per-platform social post workflow**, the editor renders an account picker so operators can pin which social account(s) the target should publish to.

### How the picker decides what to show

The editor derives the target platform from the `targetWorkflowId` using the naming convention:

```
social-post-to-<platform>-v<N>
```

Examples that produce a picker:
- `social-post-to-instagram-v1` → Instagram accounts
- `social-post-to-facebook-v1` → Facebook accounts
- `social-post-to-google-business-v1` → Google Business Profile accounts

Targets that don't match the convention (e.g. `social-execution-from-handoff`) are treated as generic forwarders — no picker is shown.

### Requirements

- The `marketing` plugin must be installed on the team whose workflow you're editing.
- That team must have Postiz connected via the plugin's **Accounts** tab.
- Accounts are grouped by canonical platform — Postiz variants (`instagram-standalone`, `facebook-page`, etc.) collapse into the same picker, but the raw identifier is preserved per account and used at publish time.

### Naming guidance

When you add a new per-platform publish workflow, follow the `social-post-to-<platform>-v<N>` convention so the editor picks it up automatically. Deviating from the convention removes the account picker for any handoff that targets your workflow.

See [`kitchen-plugin-marketing/docs/SOCIAL_EXECUTION_SETUP.md`](https://github.com/JIGGAI/kitchen-plugin-marketing/blob/main/docs/SOCIAL_EXECUTION_SETUP.md) for the full two-team setup and demo walkthrough.