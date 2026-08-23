# upkeep

A maintenance toolkit for JavaScript and TypeScript repositories, built with
[Bun](https://bun.sh).

upkeep answers the questions that come up when you inherit a codebase and need to
know what shape it is in: what is outdated, what is vulnerable, what is dead
weight, and how healthy the whole thing is. It works with npm, yarn, pnpm, and
bun without configuration.

It ships as two parts that install independently — a **CLI** that emits JSON, and
a set of **Claude Code skills** that use it.

## Install

```bash
brew install llbbl/tap/upkeep
```

Or via the install script:

```bash
curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

Other methods — manual download, from source, checksum verification — are in
[docs/INSTALLATION.md](docs/INSTALLATION.md).

## Use it

```bash
upkeep detect            # what kind of project is this?
upkeep deps              # what is outdated?
upkeep audit             # what is vulnerable?
upkeep quality           # how healthy is it, A-F?
upkeep imports lodash    # where is this package actually used?
```

Every command emits JSON, so it pipes into `jq` and composes with other tooling.
Full command reference, flags, and example output: [docs/CLI.md](docs/CLI.md).

## Claude Code skills

```text
/plugin marketplace add llbbl/upkeep
/plugin install upkeep@llbbl-upkeep
```

Four skills, each answering a different question:

| Skill | Question |
|-------|----------|
| `/upkeep:deps` | What is outdated? |
| `/upkeep:audit` | What is vulnerable? |
| `/upkeep:quality` | How healthy is this project? |
| `/upkeep:trim` | What are we carrying but not using? |

The skills shell out to the CLI, so install the binary first. Details:
[docs/SKILLS.md](docs/SKILLS.md).

## Documentation

- [Installation](docs/INSTALLATION.md) — every install method, plus verification
- [CLI reference](docs/CLI.md) — commands, flags, example output, configuration
- [Claude Code skills](docs/SKILLS.md) — what each skill does and when to reach for it
- [Development](docs/DEVELOPMENT.md) — setup, commands, project structure
- [Releasing](docs/RELEASING.md) — how the automated release pipeline works

## License

MIT
