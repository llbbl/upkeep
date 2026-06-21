#!/usr/bin/env bash
set -euo pipefail

# upkeep installer
# Usage: curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash

VERSION="${UPKEEP_VERSION:-latest}"

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
        x86_64|amd64) arch="amd64" ;;
        arm64|aarch64) arch="arm64" ;;
        *) error "Unsupported architecture: $(uname -m)" ;;
    esac

    echo "${os}-${arch}"
}

# Resolve "latest" to a concrete version tag (e.g. v0.2.0).
# Release assets are versioned (upkeep_<version>_<os>_<arch>.tar.gz), so we
# need the actual tag even for "latest".
resolve_version() {
    local version="$1"
    if [[ "$version" != "latest" ]]; then
        echo "$version"
        return
    fi

    local api="https://api.github.com/repos/llbbl/upkeep/releases/latest"
    local tag=""
    if command -v curl &> /dev/null; then
        tag=$(curl -fsSL "$api" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
    elif command -v wget &> /dev/null; then
        tag=$(wget -qO- "$api" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
    fi

    [[ -n "$tag" ]] || error "Could not resolve the latest version from GitHub. Set UPKEEP_VERSION explicitly (e.g. UPKEEP_VERSION=v0.2.0)."
    echo "$tag"
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

# Download a file (no chmod — caller decides what to do with it)
download_file() {
    local url="$1"
    local dest="$2"

    info "Downloading $url"

    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$dest" || error "Download failed: $url"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$dest" || error "Download failed: $url"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
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

    local os="${platform%-*}"
    local arch="${platform#*-}"

    local version
    version=$(resolve_version "$VERSION")   # e.g. v0.2.0
    local ver="${version#v}"                # e.g. 0.2.0
    local base_url="https://github.com/llbbl/upkeep/releases/download/${version}"

    # Windows ships as a raw .exe; Unix platforms ship as gzipped tarballs
    # containing a single binary named `upkeep`.
    if [[ "$os" == "windows" ]]; then
        local binary_path="$install_dir/upkeep.exe"
        download_file "${base_url}/upkeep_${ver}_windows_${arch}.exe" "$binary_path"
        chmod +x "$binary_path"
        info "Installed upkeep to $binary_path"
        echo "$binary_path"
        return
    fi

    local asset="upkeep_${ver}_${os}_${arch}.tar.gz"
    local tmp
    tmp=$(mktemp -d)
    download_file "${base_url}/${asset}" "$tmp/$asset"
    tar -xzf "$tmp/$asset" -C "$tmp" || error "Failed to extract $asset"

    local binary_path="$install_dir/upkeep"
    mv "$tmp/upkeep" "$binary_path"
    chmod +x "$binary_path"
    rm -rf "$tmp"

    info "Installed upkeep to $binary_path"

    # Return the path for the caller
    echo "$binary_path"
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
    echo "Claude Code skills are distributed separately via the plugin marketplace:"
    echo "  /plugin marketplace add llbbl/upkeep"
    echo "  /plugin install upkeep@llbbl-upkeep"
    echo ""
    echo "Then use /upkeep:audit, /upkeep:deps, /upkeep:quality in Claude Code."
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
    verify_installation "$binary_path"
}

# Only run main if script is executed directly (not sourced)
# When piped to bash, BASH_SOURCE is empty, so we run main
# When sourced, BASH_SOURCE[0] != $0, so we skip main
if [[ -z "${BASH_SOURCE[0]:-}" ]] || [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
