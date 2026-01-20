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
    echo -e "${GREEN}[info]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[warn]${NC} $1" >&2
}

error() {
    echo -e "${RED}[error]${NC} $1" >&2
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

# Determine install directory
# Prefer ~/.local/bin if it exists (user likely has it in PATH)
# Otherwise use ~/.upkeep/bin
get_install_dir() {
    if [[ -d "$HOME/.local/bin" ]]; then
        echo "$HOME/.local/bin"
    else
        echo "$HOME/.upkeep/bin"
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

# Install binary to global location
install_binary() {
    local platform
    platform=$(detect_platform)
    info "Detected platform: $platform"

    local install_dir
    install_dir=$(get_install_dir)

    # Create install directory if it doesn't exist
    mkdir -p "$install_dir"

    local binary_name="upkeep"
    local url
    url=$(get_download_url "$platform" "$VERSION")

    # Handle Windows extension
    if [[ "$platform" == windows-* ]]; then
        binary_name="upkeep.exe"
        url="${url}.exe"
    fi

    local binary_path="$install_dir/$binary_name"
    download_binary "$url" "$binary_path"

    info "Installed upkeep to $binary_path"

    # Return the path for use by install_skills
    echo "$binary_path"
}

# Install Claude Code skills with symlinks to the binary
install_skills() {
    local binary_path="$1"
    local platform
    platform=$(detect_platform)

    info "Installing Claude Code skills to $SKILLS_DIR"

    local skills=("upkeep-deps" "upkeep-audit" "upkeep-quality")
    local base_url="https://raw.githubusercontent.com/llbbl/upkeep/main/skills"

    local binary_name="upkeep"
    if [[ "$platform" == windows-* ]]; then
        binary_name="upkeep.exe"
    fi

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

        # Remove existing binary/symlink
        rm -f "$bin_dir/$binary_name"

        # Try symlink first (saves disk space), fall back to copy
        if [[ "$platform" != windows-* ]] && ln -s "$binary_path" "$bin_dir/$binary_name" 2>/dev/null; then
            info "  Linked to $binary_path"
        else
            # Copy on Windows or if symlink fails
            cp "$binary_path" "$bin_dir/$binary_name"
            chmod +x "$bin_dir/$binary_name"
            info "  Copied binary to $bin_dir"
        fi
    done

    info "Skills installed successfully"
}

# Show PATH instructions
show_path_instructions() {
    local install_dir
    install_dir=$(get_install_dir)

    echo ""
    warn "Make sure $install_dir is in your PATH."
    echo ""
    echo "Add this to your shell config:"
    echo ""
    echo "  # For zsh (~/.zshrc):"
    echo "  export PATH=\"\$PATH:$install_dir\""
    echo ""
    echo "  # For bash (~/.bashrc or ~/.bash_profile):"
    echo "  export PATH=\"\$PATH:$install_dir\""
    echo ""
    echo "Then restart your terminal or run: source ~/.zshrc"
    echo ""
}

# Verify installation
verify_installation() {
    local binary_path="$1"

    info "Verifying installation..."

    if [[ -x "$binary_path" ]]; then
        "$binary_path" --version
    else
        error "Installation verification failed"
    fi

    echo ""
    info "Installation complete!"

    show_path_instructions

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

    local binary_path
    binary_path=$(install_binary)
    install_skills "$binary_path"
    verify_installation "$binary_path"
}

# Only run main if script is executed directly (not sourced)
# When piped to bash, BASH_SOURCE is empty, so we run main
# When sourced, BASH_SOURCE[0] != $0, so we skip main
if [[ -z "${BASH_SOURCE[0]:-}" ]] || [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
