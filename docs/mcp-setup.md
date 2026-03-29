# Litho MCP Server Setup

Litho ships an MCP server so external AI clients (Claude Desktop, Cursor, VS Code Copilot, Claude Code, etc.) can use all Litho workspace tools.

**Requirement**: Litho must be running for the MCP server to work. The server starts automatically with the app.

## How it works

Litho runs an HTTP MCP server inside its Electron process on `127.0.0.1`. A lightweight stdio wrapper (shipped with the app) bridges between the AI client and the HTTP server. The wrapper uses Electron's bundled Node.js runtime — no external dependencies needed.

## macOS (installed app)

After installing Litho from the `.dmg`:

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "/Applications/Litho.app/Contents/Resources/bin/litho-mcp"
    }
  }
}
```

### Claude Code

In `~/.claude/settings.json` (or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "litho": {
      "command": "/Applications/Litho.app/Contents/Resources/bin/litho-mcp"
    }
  }
}
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "/Applications/Litho.app/Contents/Resources/bin/litho-mcp"
    }
  }
}
```

## Windows (installed app)

After installing Litho from the `.exe` installer:

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "C:\\Users\\USERNAME\\AppData\\Local\\Programs\\Litho\\resources\\bin\\litho-mcp.cmd"
    }
  }
}
```

Replace `USERNAME` with the Windows username.

### Claude Code

In `%USERPROFILE%\.claude\settings.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "C:\\Users\\USERNAME\\AppData\\Local\\Programs\\Litho\\resources\\bin\\litho-mcp.cmd"
    }
  }
}
```

### Cursor

In `.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "C:\\Users\\USERNAME\\AppData\\Local\\Programs\\Litho\\resources\\bin\\litho-mcp.cmd"
    }
  }
}
```

## Development

When running Litho via `pnpm dev`, the MCP server starts automatically. Use `node` directly since the packaged launcher scripts expect the Electron binary at a relative path that only exists in the installed app.

### Build the wrapper

```bash
pnpm build:mcp-wrapper
```

This produces `resources/bin/litho-mcp.cjs` (the bundled wrapper) plus the platform launcher scripts.

### Configure Claude Code for dev

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "litho": {
      "command": "node",
      "args": ["/absolute/path/to/lithoapp/resources/bin/litho-mcp.cjs"]
    }
  }
}
```

Or using `ELECTRON_RUN_AS_NODE` (matches production behavior):

```json
{
  "mcpServers": {
    "litho": {
      "command": "/absolute/path/to/lithoapp/node_modules/.bin/electron",
      "args": ["/absolute/path/to/lithoapp/resources/bin/litho-mcp.cjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

### Verify it works

With Litho running (`pnpm dev`):

```bash
# Check discovery file was written
cat ~/.litho/mcp-port

# List tools via stdio
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node resources/bin/litho-mcp.cjs

# Call a tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listWorkspaces","arguments":{}}}' | node resources/bin/litho-mcp.cjs
```

## Available tools

The MCP server exposes 23 tools:

| Tool | Description |
|---|---|
| `listWorkspaces` | List all workspaces with slugs and titles |
| `listDocuments` | List documents in a workspace |
| `listPages` | List pages in a document |
| `readPage` | Read page source |
| `writePage` | Write full page content |
| `editPage` | Edit page via fuzzy string replacement |
| `createPage` | Create a new page |
| `deletePage` | Delete a page |
| `updatePageDetails` | Update page name/description |
| `movePage` | Reorder pages |
| `createDocument` | Create a new document |
| `deleteDocument` | Delete a document |
| `renameDocument` | Rename a document |
| `duplicateDocument` | Duplicate a document |
| `moveDocumentToFolder` | Move document to a folder |
| `updateDocumentSize` | Change document page size |
| `updateDocumentDescription` | Set document description |
| `readMainCss` | Read workspace styles.css |
| `writeMainCss` | Replace workspace styles.css |
| `editMainCss` | Edit styles.css via fuzzy replacement |
| `grepPages` | Full-text search across pages |
| `listWorkspaceAssets` | List workspace assets |
| `listDocumentAssets` | List document assets |

All tools except `listWorkspaces` require a `workspace` parameter (the workspace slug).

## Troubleshooting

**"Litho is not running"** — Start Litho before connecting the MCP client. The wrapper retries for 5 seconds then exits.

**Tools not appearing** — Restart the MCP client after adding the config. Check `~/.litho/mcp-port` exists (confirms the server started).

**401 Unauthorized** — The discovery file token is stale. Restart Litho to regenerate it, then reconnect the MCP client.

**Wrapper not found** — Verify the path matches your install location. On macOS, Litho must be in `/Applications/`. On Windows, check the default NSIS install path.
