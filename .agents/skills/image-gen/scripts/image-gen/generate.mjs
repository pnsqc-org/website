#!/usr/bin/env node

/**
 * CLI tool to generate images using Google Gemini 2.5 Flash Image
 * Usage: node generate.mjs "your prompt here" [--output filename.png] [--aspect 16:9]
 */

const VALID_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file
function findUp(startDir, filename) {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadEnv() {
  const envPathFromCwd = findUp(process.cwd(), ".env");
  const envPathFromScript = findUp(__dirname, ".env");
  const envPath = envPathFromCwd || envPathFromScript;

  if (!envPath) {
    console.error("Error: .env file not found.");
    console.error("Looked in:");
    console.error(` - ${process.cwd()} (and parents)`);
    console.error(` - ${__dirname} (and parents)`);
    process.exit(1);
  }

  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  }
}

function parseArgs(args) {
  const result = { prompt: null, output: null, aspectRatio: null };
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") {
      const value = args[++i];
      if (!value || value.startsWith("-")) {
        console.error("Error: Missing value for --output");
        printUsage();
        process.exit(1);
      }
      result.output = value;
    } else if (args[i] === "--aspect" || args[i] === "-a") {
      const value = args[++i];
      if (!value || value.startsWith("-")) {
        console.error("Error: Missing value for --aspect");
        printUsage();
        process.exit(1);
      }
      result.aspectRatio = value;
    } else if (args[i] === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    } else if (args[i].startsWith("-")) {
      console.error(`Error: Unknown option "${args[i]}"`);
      printUsage();
      process.exit(1);
    } else {
      positionals.push(args[i]);
    }
  }

  result.prompt = positionals.length ? positionals.join(" ") : null;
  return result;
}

function printUsage() {
  console.log(`
Gemini Image Generator CLI

Usage:
  node generate.mjs "your prompt" [options]

Options:
  -o, --output <filename>   Output filename (default: generated-{timestamp}.<ext>)
  -a, --aspect <ratio>      Aspect ratio (default: 1:1)

Aspect Ratios:
  ${VALID_ASPECT_RATIOS.join(", ")}

Examples:
  node generate.mjs "a serene mountain landscape at sunset"
  node generate.mjs "abstract art with blue and gold colors" -o artwork.png
  node generate.mjs "wide cinematic landscape" -a 16:9 -o landscape.png

Environment:
  Requires GEMINI_API_KEY in a .env file (searched upward from your current directory, then from the script directory)
`);
}

async function generateImage(prompt, apiKey, aspectRatio = "1:1") {
  const model = "gemini-2.5-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    },
  };

  console.log(`Generating image with prompt: "${prompt}"`);
  console.log("Using model:", model);
  console.log("Aspect ratio:", aspectRatio);
  console.log("Please wait...\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Extract image data from response
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error("No candidates in response");
  }

  const parts = candidates[0].content?.parts || [];
  let imageData = null;
  let textResponse = null;

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      imageData = {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      };
    }
    if (part.text) {
      textResponse = part.text;
    }
  }

  return { imageData, textResponse };
}

function getExtensionFromMimeType(mimeType) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[mimeType] || ".png";
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  loadEnv();

  const { prompt, output, aspectRatio } = parseArgs(args);

  if (!prompt) {
    console.error("Error: Please provide a prompt");
    printUsage();
    process.exit(1);
  }

  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    console.error(`Error: Invalid aspect ratio "${aspectRatio}"`);
    console.error(`Valid ratios: ${VALID_ASPECT_RATIOS.join(", ")}`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not found in .env file");
    process.exit(1);
  }

  try {
    const { imageData, textResponse } = await generateImage(prompt, apiKey, aspectRatio || "1:1");

    if (textResponse) {
      console.log("Model response:", textResponse, "\n");
    }

    if (imageData) {
      const ext = getExtensionFromMimeType(imageData.mimeType);
      const filename = output || `generated-${Date.now()}${ext}`;
      const outputPath = resolve(process.cwd(), filename);

      const buffer = Buffer.from(imageData.data, "base64");
      writeFileSync(outputPath, buffer);

      console.log(`Image saved to: ${outputPath}`);
      console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
    } else {
      console.log("No image was generated. The model may have returned text only.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
