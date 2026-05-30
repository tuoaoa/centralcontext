#!/bin/bash
# install-zsh-hook.sh - Installs zsh hook for CentralContext terminal capture

# Get directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# Read .env file from PROJECT_ROOT
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "\x1b[31mError: .env file not found at $PROJECT_ROOT\x1b[0m"
    exit 1
fi

# Load variables from env file
API_KEY=$(grep "^CENTRAL_CONTEXT_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$PORT" ]; then
    PORT=3000
fi

if [ -z "$API_KEY" ]; then
    echo -e "\x1b[31mError: CENTRAL_CONTEXT_API_KEY not found in .env\x1b[0m"
    exit 1
fi

ZSHRC="$HOME/.zshrc"
if [ ! -f "$ZSHRC" ]; then
    touch "$ZSHRC"
fi

# Check if hook already installed and remove to prevent duplicates
if grep -q "centralcontext_preexec" "$ZSHRC"; then
    echo -e "\x1b[33mZsh hook already installed in $ZSHRC. Updating configuration...\x1b[0m"
    sed -i '' '/# === CentralContext Terminal Hook Start ===/,/# === CentralContext Terminal Hook End ===/d' "$ZSHRC"
fi

# Define the hook block with single-line curl and background subshell debug logging
HOOK_BLOCK=$(cat << 'EOF'
# === CentralContext Terminal Hook Start ===
export CC_API_KEY="API_KEY_PLACEHOLDER"
export CC_API_URL="http://localhost:PORT_PLACEHOLDER/api/log/raw"

function centralcontext_preexec() {
    export CENTRALCONTEXT_LAST_COMMAND="$1"
    export CENTRALCONTEXT_LAST_CWD="$PWD"
    export CENTRALCONTEXT_LAST_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Append to debug log
    echo "PREEXEC: $1" >> ~/.centralcontext-hook-debug.log
}

function centralcontext_precmd() {
    local exit_code=$?
    
    if [ -n "$CENTRALCONTEXT_LAST_COMMAND" ]; then
        # Append to debug log
        echo "PRECMD: $exit_code $CENTRALCONTEXT_LAST_COMMAND" >> ~/.centralcontext-hook-debug.log
        
        # Redact passwords/tokens natively
        local clean_cmd="$CENTRALCONTEXT_LAST_COMMAND"
        if [[ "$clean_cmd" =~ "(password|token|key|secret|auth|bearer|private|passwd|--password|-p|API_KEY|export |npm_config_use_sec)" ]]; then
            clean_cmd="[REDACTED SENSITIVE COMMAND]"
        fi
        
        # Skip logging background curl logging requests
        if [[ "$clean_cmd" == *"curl"* && "$clean_cmd" == *"/api/log/raw"* ]]; then
            unset CENTRALCONTEXT_LAST_COMMAND
            return
        fi
        
        export CMD="$clean_cmd"
        export EXIT="$exit_code"
        export CWD="$CENTRALCONTEXT_LAST_CWD"
        export TS="$CENTRALCONTEXT_LAST_TS"
        
        local payload=$(node -e '
            const payload = {
                source: "terminal",
                type: parseInt(process.env.EXIT) !== 0 ? "terminal_error" : "terminal_run",
                project: "CentralContext",
                quality_score: parseInt(process.env.EXIT) !== 0 ? 4 : 3,
                memory_priority: parseInt(process.env.EXIT) !== 0 ? "high" : "useful",
                content: `Command: ${process.env.CMD}\nExit Code: ${process.env.EXIT}\nCWD: ${process.env.CWD}\nTimestamp: ${process.env.TS}`
            };
            console.log(JSON.stringify(payload));
        ' 2>/dev/null)
        
        if [ -n "$payload" ]; then
            # Run curl in a subshell background task to avoid blocking and write debug status
            (
                curl -s -o /dev/null -X POST -H "x-api-key: $CC_API_KEY" -H "Content-Type: application/json" -d "$payload" "$CC_API_URL"
                if [ $? -eq 0 ]; then
                    echo "POST_OK" >> ~/.centralcontext-hook-debug.log
                else
                    echo "POST_FAIL" >> ~/.centralcontext-hook-debug.log
                fi
            ) &!
        fi
        
        unset CENTRALCONTEXT_LAST_COMMAND
        unset CENTRALCONTEXT_LAST_CWD
        unset CENTRALCONTEXT_LAST_TS
        unset CMD
        unset EXIT
        unset CWD
        unset TS
    fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec centralcontext_preexec
add-zsh-hook precmd centralcontext_precmd
# === CentralContext Terminal Hook End ===
EOF
)

# Substitute configuration values safely
HOOK_BLOCK="${HOOK_BLOCK/API_KEY_PLACEHOLDER/$API_KEY}"
HOOK_BLOCK="${HOOK_BLOCK/PORT_PLACEHOLDER/$PORT}"

# Append hook block to ~/.zshrc
echo "" >> "$ZSHRC"
echo "$HOOK_BLOCK" >> "$ZSHRC"

echo -e "\x1b[32mSuccess: CentralContext terminal hook successfully installed in $ZSHRC!\x1b[0m"
echo -e "\x1b[36mPlease run: source ~/.zshrc to activate in current session!\x1b[0m"
