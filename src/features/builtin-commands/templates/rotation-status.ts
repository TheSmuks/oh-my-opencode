export const ROTATION_STATUS_TEMPLATE = `Display model rotation status for all agents with rotation enabled.

## What to Check

For each agent with rotation enabled, show:
1. **Agent Name**: Which agent has rotation
2. **Available Models**: List of models in rotation pool
3. **Rotation Config**: Limit type, limit value, cooldown period
4. **Current State**: Which model is currently being used (if available)

## Format

For each agent, display in this format:

### {agent-name}
Models: {model1}, {model2}, {model3}
Config: {limitType}={limitValue}, cooldown={cooldownMs}ms
State: {current model or "not tracked yet"}

## Instructions

1. Determine OpenCode config directory:
   - If $OPENCODE_CONFIG_DIR is set, use that
   - Else on Linux/macOS use $XDG_CONFIG_HOME/opencode (or ~/.config/opencode)
   - Else on Windows use %APPDATA%\\opencode (fallback: ~/.config/opencode)
2. Read rotation configuration from: {configDir}/oh-my-opencode.json
3. Read rotation state from: {configDir}/model-rotation-state.json (if exists)
3. Display all agents with rotation.enabled=true
4. For each agent, show their model pool and rotation config
5. If state file exists, show current tracked model for each agent

## Example Output

### Sisyphus
Models: github-copilot/claude-opus-4-5, github-copilot/claude-sonnet-4.5, zai-coding-plan/glm-4.7
Config: calls=100, cooldown=180000ms
State: github-copilot/claude-opus-4-5 (2 calls used)

### oracle
Models: github-copilot/claude-opus-4-5, zai-coding-plan/glm-4.7
Config: calls=50, cooldown=120000ms
State: zai-coding-plan/glm-4.7 (12 calls used)

Display status for all configured rotation agents.`
