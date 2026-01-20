#!/usr/bin/env bash
set -euo pipefail

# upkeep global CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/global.sh | bash
#
# Installs the upkeep binary to a directory in your PATH for global CLI usage.
# For Claude Code skills, use install.sh instead.

VERSION="${UPKEEP_VERSION:-latest}"
INSTALL_DIR="${UPKEEP_INSTALL_DIR:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

prompt() {
    echo -e "${BLUE}[?]${NC} $1"
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

# Check if a directory is in PATH
is_in_path() {
    local dir="$1"
    [[ ":$PATH:" == *":$dir:"* ]]
}

# Find common bin directories that are in PATH
find_path_dirs() {
    local dirs=()

    # Common user bin directories
    local candidates=(
        "$HOME/.local/bin"
        "$HOME/bin"
        "$HOME/.bin"
        "/usr/local/bin"
    )

    for dir in "${candidates[@]}"; do
        if is_in_path "$dir"; then
            dirs+=("$dir")
        fi
    done

    echo "${dirs[@]:-}"
}

# Suggest installation directory
suggest_install_dir() {
    local path_dirs
    path_dirs=$(find_path_dirs)

    if [[ -n "$path_dirs" ]]; then
        # Return first directory in PATH
        echo "$path_dirs" | awk '{print $1}'
    else
        # Default fallback
        echo "$HOME/.local/bin"
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

    # Determine install directory
    if [[ -z "$INSTALL_DIR" ]]; then
        INSTALL_DIR=$(suggest_install_dir)

        if ! is_in_path "$INSTALL_DIR"; then
            warn "No common bin directory found in your PATH."
            warn "Will install to: $INSTALL_DIR"
            warn ""
            warn "You'll need to add it to your PATH. Add this to your shell profile:"
            warn "  export PATH=\"\$PATH:$INSTALL_DIR\""
            warn ""
        else
            info "Installing to: $INSTALL_DIR (found in PATH)"
        fi
    else
        if ! is_in_path "$INSTALL_DIR"; then
            warn "Custom install directory '$INSTALL_DIR' is not in your PATH."
            warn "You may need to add it or use the full path to run upkeep."
        fi
    fi

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
}

# Verify installation
verify_installation() {
    info "Verifying installation..."

    if command -v upkeep &> /dev/null; then
        upkeep --version
        echo ""
        info "Installation complete! 'upkeep' is available globally."
    elif [[ -x "$INSTALL_DIR/upkeep" ]]; then
        "$INSTALL_DIR/upkeep" --version
        echo ""
        info "Installation complete!"
        warn "'upkeep' is installed but not in PATH. Use full path or add to PATH:"
        warn "  $INSTALL_DIR/upkeep"
    else
        error "Installation verification failed"
    fi

    echo ""
    echo "Usage:"
    echo "  upkeep detect     # Detect project configuration"
    echo "  upkeep deps       # Analyze dependencies"
    echo "  upkeep audit      # Security audit"
    echo "  upkeep quality    # Quality report"
    echo ""
    echo "For Claude Code skills, run the skills installer:"
    echo "  curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash"
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
    echo "Global CLI Installer"
    echo ""

    install_binary
    verify_installation
}

# Only run main if script is executed directly (not sourced)
if [[ -z "${BASH_SOURCE[0]:-}" ]] || [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
