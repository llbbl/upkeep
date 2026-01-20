#!/usr/bin/env bash
set -euo pipefail

# upkeep installer
# Usage: curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash

VERSION="${UPKEEP_VERSION:-latest}"
INSTALL_DIR="${UPKEEP_INSTALL_DIR:-$HOME/.local/bin}"
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

    # Adjust for platform-specific naming
    if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
        arch="x64"  # Intel Mac
    fi

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

# Download binary
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

# Install binary
install_binary() {
    local platform
    platform=$(detect_platform)

    info "Detected platform: $platform"

    # Create install directory if it doesn't exist
    mkdir -p "$INSTALL_DIR"

    local binary_path="$INSTALL_DIR/upkeep"
    local url
    url=$(get_download_url "$platform" "$VERSION")

    # Handle Windows extension
    if [[ "$platform" == windows-* ]]; then
        binary_path="$INSTALL_DIR/upkeep.exe"
        url="${url}.exe"
    fi

    download_binary "$url" "$binary_path"

    info "Installed upkeep to $binary_path"

    # Check if install dir is in PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        warn "$INSTALL_DIR is not in your PATH"
        warn "Add this to your shell profile:"
        warn "  export PATH=\"\$PATH:$INSTALL_DIR\""
    fi
}

# Install Claude Code skills
install_skills() {
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

        # Create symlink to binary (or copy if symlinks not supported)
        if [[ -L "$bin_dir/upkeep" ]] || [[ -f "$bin_dir/upkeep" ]]; then
            rm -f "$bin_dir/upkeep"
        fi

        if ln -s "$INSTALL_DIR/upkeep" "$bin_dir/upkeep" 2>/dev/null; then
            info "  Created symlink to binary"
        else
            # Fallback: copy the binary
            cp "$INSTALL_DIR/upkeep" "$bin_dir/upkeep"
            info "  Copied binary (symlinks not supported)"
        fi
    done

    info "Skills installed successfully"
}

# Verify installation
verify_installation() {
    info "Verifying installation..."

    if ! command -v upkeep &> /dev/null; then
        # Try the direct path
        if [[ -x "$INSTALL_DIR/upkeep" ]]; then
            "$INSTALL_DIR/upkeep" --version
        else
            error "Installation verification failed"
        fi
    else
        upkeep --version
    fi

    echo ""
    info "Installation complete!"
    echo ""
    echo "Usage:"
    echo "  upkeep detect     # Detect project configuration"
    echo "  upkeep deps       # Analyze dependencies"
    echo "  upkeep audit      # Security audit"
    echo "  upkeep quality    # Quality report"
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

    install_binary
    install_skills
    verify_installation
}

# Only run main if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
