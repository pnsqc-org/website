# Gemini Image Generator CLI (repo tool)

## Command

Run from the repo root:

```bash
node skills/public/image-gen/scripts/image-gen/generate.mjs "<prompt>" [-a <ratio>] [-o <path>]
```

Or run from inside the skill folder:

```bash
cd skills/public/image-gen
node scripts/image-gen/generate.mjs "<prompt>" [-a <ratio>] [-o <path>]
```

## Options

- `-a, --aspect <ratio>`: aspect ratio (default: `1:1`)
- `-o, --output <filename>`: output filename (default: `generated-{timestamp}.<ext>`)
- `-h, --help`: show help

## Supported aspect ratios

`1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

## Output path behavior

- The CLI writes to `process.cwd()`, so output paths are relative to the directory you run the command from.
- The CLI does not create directories; create them first if needed.

## Prompting tips

See `skills/public/image-gen/references/prompting.md`.
