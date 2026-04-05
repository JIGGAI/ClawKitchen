# Team Memory Management

## Overview

ClawKitchen provides comprehensive team memory management through a dedicated interface for organizing, editing, and maintaining shared team knowledge. This system ensures consistent team context across workflows and agent interactions.

## Memory System Architecture

### Memory File Structure
Team memories are organized in the team workspace:
```
shared-context/
├── memory/
│   ├── core-knowledge.jsonl
│   ├── project-context.jsonl
│   ├── team-decisions.jsonl
│   └── procedures.jsonl
├── MEMORY.md
└── README.md
```

### File Types
- **JSONL Files**: Structured memory entries with timestamps and metadata
- **Markdown Files**: Human-readable documentation and procedures
- **README Files**: Team onboarding and overview information

## Memory Tab Interface

### Accessing Team Memory
1. Navigate to your team workspace
2. Click the **"Memory"** tab in the team editor
3. View organized memory files and content

### File Browser
The memory interface provides:
- **File List**: All memory files with size and modification dates
- **Search**: Full-text search across all memory content
- **Filters**: Filter by file type, date range, or content category
- **Sorting**: Sort by name, date, size, or relevance

### Memory Editor
Built-in editor for memory files:
- **Syntax Highlighting**: Markdown and JSON syntax support
- **Live Preview**: Real-time preview for Markdown files
- **Auto-Save**: Automatic saving of changes
- **Version History**: Track changes with git integration

## Types of Team Memory

### Core Knowledge (core-knowledge.jsonl)
Fundamental team information and capabilities:
```json
{"type": "capability", "content": "Team specializes in React/Next.js frontend development", "timestamp": "2024-03-15T10:30:00Z"}
{"type": "constraint", "content": "All UI components must follow design system guidelines", "timestamp": "2024-03-15T10:31:00Z"}
{"type": "resource", "content": "Team design system: https://design.company.com", "timestamp": "2024-03-15T10:32:00Z"}
```

### Project Context (project-context.jsonl)
Current project status and objectives:
```json
{"type": "objective", "content": "Q2 2024: Launch customer dashboard redesign", "timestamp": "2024-03-15T10:30:00Z"}
{"type": "milestone", "content": "User testing completed March 20, 2024", "timestamp": "2024-03-20T15:00:00Z"}
{"type": "blocker", "content": "Waiting on API changes from backend team", "timestamp": "2024-03-22T09:15:00Z"}
```

### Team Decisions (team-decisions.jsonl)
Important decisions and their rationale:
```json
{"type": "decision", "content": "Use TypeScript for all new components", "rationale": "Improved type safety and developer experience", "timestamp": "2024-02-01T14:00:00Z"}
{"type": "policy", "content": "All PRs require two approvals", "rationale": "Ensure code quality and knowledge sharing", "timestamp": "2024-02-15T11:30:00Z"}
```

### Procedures (procedures.jsonl)
Team processes and workflows:
```json
{"type": "procedure", "content": "Deploy process: feature branch → staging → production", "steps": ["Create feature branch", "Submit PR", "QA review", "Deploy to staging", "Production deploy"], "timestamp": "2024-02-20T16:00:00Z"}
```

## Memory Injection in Workflows

### Automatic Injection
LLM workflow nodes automatically receive team memory context:
- **Memory Files**: All relevant `.jsonl` and `.md` files
- **Contextual Filtering**: Only relevant memories based on workflow type
- **Token Management**: Optimized memory selection to stay within token limits

### Manual Context Control
Override automatic injection in workflow nodes:
```json
{
  "id": "specialized_llm_task",
  "kind": "llm",
  "action": {
    "memoryInclusion": {
      "files": ["core-knowledge.jsonl", "project-context.jsonl"],
      "exclude": ["archived-decisions.jsonl"],
      "maxTokens": 2000
    }
  }
}
```

### Memory Templates
Create reusable memory templates for common workflow types:
```json
{
  "name": "frontend-development",
  "includes": ["core-knowledge.jsonl", "coding-standards.jsonl", "design-system.md"],
  "context": "Frontend development workflows requiring design system compliance"
}
```

## Managing Memory Content

### Adding Memory Entries

#### Through the Interface
1. Open the **Memory** tab
2. Select target memory file
3. Click **"Add Entry"**
4. Choose entry type and fill content
5. Save to automatically timestamp and format

#### Programmatically
Memory entries can be added via workflow nodes:
```json
{
  "id": "record_decision",
  "kind": "tool",
  "action": {
    "tool": "memory.add",
    "args": {
      "file": "team-decisions.jsonl",
      "type": "decision",
      "content": "{{decision_content}}",
      "metadata": {"source": "workflow", "workflow_id": "{{workflow.id}}"}
    }
  }
}
```

### Editing Memory
- **Direct Editing**: Edit memory files directly in the interface
- **Bulk Operations**: Import/export memory content
- **Merge Conflicts**: Handle concurrent edits with git-based resolution
- **Validation**: Automatic validation of JSONL format and schema

### Memory Cleanup
Regular maintenance features:
- **Duplicate Detection**: Find and merge duplicate entries
- **Archive Old Content**: Move outdated entries to archive files
- **Size Management**: Monitor memory size and optimize for performance
- **Relevance Scoring**: Identify unused or outdated memory entries

## Memory Search and Discovery

### Full-Text Search
Comprehensive search across all memory content:
- **Keyword Search**: Find entries by content keywords
- **Metadata Search**: Search by entry type, date, or author
- **Fuzzy Matching**: Find entries with similar content
- **Regular Expressions**: Advanced search patterns

### Semantic Search
AI-powered semantic search capabilities:
- **Concept Search**: Find entries related to concepts
- **Question Answering**: Ask questions about team knowledge
- **Context Suggestions**: Recommend relevant memories for current work
- **Knowledge Gaps**: Identify missing information in team memory

### Memory Insights
Analytics and insights about team memory:
- **Usage Patterns**: Which memories are referenced most often
- **Knowledge Coverage**: Gaps in team documentation
- **Memory Growth**: Tracking knowledge accumulation over time
- **Team Contributions**: Who contributes what types of knowledge

## Memory Best Practices

### Content Organization

#### Granular Entries
Keep memory entries focused and specific:
- **One Concept per Entry**: Avoid combining multiple ideas
- **Clear Categories**: Use consistent entry types
- **Descriptive Content**: Make entries self-explanatory
- **Regular Updates**: Keep information current

#### Consistent Structure
Establish team conventions for memory format:
```json
{
  "type": "coding-standard",
  "content": "Use kebab-case for CSS class names",
  "category": "frontend",
  "importance": "high",
  "examples": [".nav-menu", ".sidebar-content"],
  "timestamp": "2024-03-15T10:30:00Z",
  "author": "jane.developer"
}
```

#### Hierarchical Organization
Use categories and tags for organization:
- **Primary Categories**: Major knowledge areas (technical, process, product)
- **Subcategories**: Specific domains (frontend, backend, design)
- **Tags**: Cross-cutting topics (security, performance, accessibility)

### Maintenance Workflows

#### Regular Reviews
Implement memory maintenance routines:
```
Weekly: Review new entries for accuracy and completeness
Monthly: Archive outdated information and update procedures  
Quarterly: Comprehensive memory audit and reorganization
```

#### Version Control Integration
Leverage git for memory management:
- **Change Tracking**: Monitor who changed what and when
- **Branching**: Experimental memory changes in feature branches
- **Rollback**: Revert problematic memory changes
- **Collaboration**: Review memory changes through pull requests

#### Quality Assurance
Ensure memory accuracy and completeness:
- **Peer Review**: Have team members validate new memory entries
- **Source Verification**: Link entries to authoritative sources
- **Regular Validation**: Check that procedures still work as documented
- **Feedback Loops**: Update memory based on workflow outcomes

## Integration with Team Workflows

### Onboarding Automation
Use memory for team member onboarding:
```
New Member → Generate Onboarding Plan → Deliver Key Memory → Track Progress
```

### Knowledge Sharing
Automated knowledge distribution:
```
New Decision → Update Memory → Notify Team → Update Related Workflows
```

### Continuous Learning
Learn from workflow outcomes:
```
Workflow Completion → Extract Lessons → Update Memory → Share Insights
```

## Troubleshooting Memory Issues

### Common Problems

**Memory Not Loading in Workflows**
- Check file permissions and accessibility
- Verify memory file format (valid JSONL)
- Review memory injection configuration
- Test memory file syntax

**Search Not Finding Content**
- Rebuild search index via Memory tab
- Check search query syntax and filters
- Verify content is properly indexed
- Review file permissions

**Performance Issues**
- Monitor memory file sizes
- Archive old or unused content  
- Optimize memory selection for workflows
- Review memory injection token limits

**Conflicting Information**
- Implement memory validation workflows
- Regular audits to identify conflicts
- Version control to track change sources
- Clear ownership and update procedures

### Memory Recovery
Disaster recovery procedures:
- **Git History**: Recover from version control
- **Backups**: Restore from team workspace backups
- **Export/Import**: Transfer memory between environments
- **Reconstruction**: Rebuild critical memory from documentation

## Advanced Memory Features

### Memory Templates
Reusable memory structures for new teams:
```json
{
  "template": "software-team",
  "memories": [
    {"type": "capability", "content": "Primary technology stack: {{tech_stack}}"},
    {"type": "procedure", "content": "Code review process: {{review_process}}"},
    {"type": "contact", "content": "Team lead: {{team_lead}}"}
  ]
}
```

### Memory Automation
Automated memory management:
- **Workflow Integration**: Auto-update memory from workflow outcomes
- **External Sync**: Sync with external knowledge bases
- **Smart Suggestions**: AI-powered memory entry suggestions
- **Maintenance Alerts**: Notifications for outdated or missing memory

### Memory Analytics
Insights into team knowledge:
- **Knowledge Graph**: Visualize relationships between memory entries
- **Usage Metrics**: Track which memories are most valuable
- **Growth Analysis**: Monitor team knowledge accumulation
- **Gap Analysis**: Identify missing knowledge areas

Effective team memory management ensures consistent context across all team activities and enables more intelligent automation through better-informed AI agents.