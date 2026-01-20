#!/usr/bin/env bash
set -euo pipefail

# upkeep installer
# Usage: curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash

VERSION="${UPKEEP_VERSION:-latest}"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[info]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[warn]${NC} $1"
}

error() {
    echo -e "${RED}[error]${NC} $1"
    exit 1
}

# Detect platform
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) error "Unsupported operating system: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *) error "Unsupported architecture: $(uname -m)" ;;
    esac

    echo "${os}-${arch}"
}

# Get download URL for the binary
get_download_url() {
    local platform="$1"
    local version="$2"
    local base_url="https://github.com/llbbl/upkeep/releases"

    if [[ "$version" == "latest" ]]; then
        echo "${base_url}/latest/download/upkeep-${platform}"
    else
        echo "${base_url}/download/${version}/upkeep-${platform}"
    fi
}

# Download binary to a temporary file
download_binary() {
    local url="$1"
    local dest="$2"

    info "Downloading upkeep from $url"

    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$dest"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi

    chmod +x "$dest"
}

# Install Claude Code skills with binary
install_skills() {
    local platform
    platform=$(detect_platform)
    info "Detected platform: $platform"

    local url
    url=$(get_download_url "$platform" "$VERSION")

    # Handle Windows extension
    local binary_name="upkeep"
    if [[ "$platform" == windows-* ]]; then
        binary_name="upkeep.exe"
        url="${url}.exe"
    fi

    # Download binary to temp file
    local temp_binary
    temp_binary=$(mktemp)
    download_binary "$url" "$temp_binary"

    info "Installing Claude Code skills to $SKILLS_DIR"

    local skills=("upkeep-deps" "upkeep-audit" "upkeep-quality")
    local base_url="https://raw.githubusercontent.com/llbbl/upkeep/main/skills"

    for skill in "${skills[@]}"; do
        local skill_dir="$SKILLS_DIR/$skill"
        local bin_dir="$skill_dir/bin"

        mkdir -p "$bin_dir"

        # Download skill file
        info "Installing skill: $skill"
        if command -v curl &> /dev/null; then
            curl -fsSL "$base_url/$skill/SKILL.md" -o "$skill_dir/SKILL.md"
        else
            wget -q "$base_url/$skill/SKILL.md" -O "$skill_dir/SKILL.md"
        fi

        # Copy binary to skill's bin directory
        cp "$temp_binary" "$bin_dir/$binary_name"
        chmod +x "$bin_dir/$binary_name"
        info "  Installed binary to $bin_dir/$binary_name"
    done

    # Clean up temp file
    rm -f "$temp_binary"

    info "Skills installed successfully"
}

# Verify installation
verify_installation() {
    info "Verifying installation..."

    # Use the first skill's binary to verify
    local test_binary="$SKILLS_DIR/upkeep-deps/bin/upkeep"
    if [[ -x "$test_binary" ]]; then
        "$test_binary" --version
    else
        error "Installation verification failed"
    fi

    echo ""
    info "Installation complete!"
    echo ""
    echo "Claude Code skills installed:"
    echo "  /upkeep-deps      # Dependency upgrades"
    echo "  /upkeep-audit     # Security fixes"
    echo "  /upkeep-quality   # Quality improvements"
}

# Main
main() {
    echo ""
    echo "  _   _ _ __  | | _____  ___ _ __  "
    echo " | | | | '_ \ | |/ / _ \/ _ \ '_ \ "
    echo " | |_| | |_) ||   <  __/  __/ |_) |"
    echo "  \__,_| .__/ |_|\_\___|\___| .__/ "
    echo "       |_|                  |_|    "
    echo ""
    echo "JS/TS Repository Maintenance Toolkit"
    echo ""

    install_skills
    verify_installation
}

# Only run main if script is executed directly (not sourced)
# When piped to bash, BASH_SOURCE is empty, so we run main
# When sourced, BASH_SOURCE[0] != $0, so we skip main
if [[ -z "${BASH_SOURCE[0]:-}" ]] || [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
