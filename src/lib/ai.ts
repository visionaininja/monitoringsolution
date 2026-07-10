// ─── AI API Integration ──────────────────────────────────────────────────────
// Handles calling Gemini and Claude APIs for pipeline/commit analysis

const AI_GEMINI_KEY = "devops_dashboard_gemini_key";
const AI_ANTHROPIC_KEY = "devops_dashboard_anthropic_key";

export const getGeminiApiKey = (): string | null => localStorage.getItem(AI_GEMINI_KEY);
export const setGeminiApiKey = (key: string) => localStorage.setItem(AI_GEMINI_KEY, key);
export const removeGeminiApiKey = () => localStorage.removeItem(AI_GEMINI_KEY);

export const getAnthropicApiKey = (): string | null => localStorage.getItem(AI_ANTHROPIC_KEY);
export const setAnthropicApiKey = (key: string) => localStorage.setItem(AI_ANTHROPIC_KEY, key);
export const removeAnthropicApiKey = () => localStorage.removeItem(AI_ANTHROPIC_KEY);

// ─── Model ID Mapping ────────────────────────────────────────────────────────

const GEMINI_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-1.5-pro": "gemini-1.5-pro",
};

const CLAUDE_MODEL_MAP: Record<string, string> = {
  "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3-opus": "claude-3-opus-20240229",
  "claude-3-5-haiku": "claude-3-5-haiku-20241022",
};

export const isGeminiModel = (model: string) => model.startsWith("gemini");
export const isClaudeModel = (model: string) => model.startsWith("claude");

// ─── Prompt Builder ──────────────────────────────────────────────────────────

export interface PipelineContext {
  repoName: string;
  workflowName: string;
  runNumber: number;
  runConclusion: string;
  event: string;
  branch: string;
  actor: string;
  headSha: string;
  runUrl: string;
  createdAt: string;
  jobs: {
    name: string;
    conclusion: string;
    duration: number;
    steps: { name: string; conclusion: string; number: number }[];
  }[];
  errorLogs: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  commitFiles: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

export const buildPipelinePrompt = (ctx: PipelineContext): string => {
  let prompt = `You are a senior DevOps engineer and CI/CD expert. Analyze this GitHub Actions pipeline failure in detail and provide a comprehensive root cause analysis with actionable, specific solutions.

## Pipeline Context
- **Repository:** ${ctx.repoName}
- **Workflow:** ${ctx.workflowName}
- **Run Number:** #${ctx.runNumber}
- **Trigger:** \`${ctx.event}\` on branch \`${ctx.branch}\`
- **Triggered By:** ${ctx.actor}
- **Head Commit SHA:** ${ctx.headSha}
- **Conclusion:** ${ctx.runConclusion}
- **Run URL:** ${ctx.runUrl}

## Jobs and Steps
`;

  ctx.jobs.forEach((job) => {
    prompt += `\n### Job: ${job.name} (${job.conclusion}, ${job.duration}s)\n`;
    job.steps.forEach((step) => {
      const icon = step.conclusion === "success" ? "✅" : step.conclusion === "failure" ? "❌" : "⏭️";
      prompt += `  ${icon} Step #${step.number}: ${step.name} → ${step.conclusion}\n`;
    });
  });

  if (ctx.errorLogs) {
    // Limit logs to ~4000 chars to stay within token budget
    const trimmedLogs = ctx.errorLogs.length > 4000
      ? ctx.errorLogs.substring(ctx.errorLogs.length - 4000)
      : ctx.errorLogs;
    prompt += `\n## Error Logs (from failed job)\n\`\`\`\n${trimmedLogs}\n\`\`\`\n`;
  }

  if (ctx.commitMessage) {
    prompt += `\n## Triggering Commit\n`;
    prompt += `- **Author:** ${ctx.commitAuthor}\n`;
    prompt += `- **Message:** ${ctx.commitMessage}\n`;
    prompt += `- **Files Changed:** ${ctx.commitFiles.length}\n\n`;

    ctx.commitFiles.forEach((f) => {
      prompt += `- \`${f.filename}\` (+${f.additions}, -${f.deletions}) [${f.status}]\n`;
    });

    // Include patches (limited per file)
    const filesWithPatches = ctx.commitFiles.filter((f) => f.patch);
    if (filesWithPatches.length > 0) {
      prompt += `\n## Code Changes (Diff Patches)\n`;
      filesWithPatches.forEach((f) => {
        const patch = (f.patch || "").substring(0, 2000);
        prompt += `\n### ${f.filename}\n\`\`\`diff\n${patch}\n\`\`\`\n`;
      });
    }
  }

  prompt += `
---

## Instructions

Provide your analysis in **Markdown format** with the following structure:

### 1. 🚨 Error Identification
Identify the exact error from the logs. Quote the specific error message.

### 2. 🔍 Root Cause Analysis
Explain WHY this error happened in this specific context. Be very specific — reference the actual files, code changes, and log lines. Don't be vague or generic.

### 3. 🛠️ Solutions
Provide **2 to 4 solutions**, ordered from the **easiest/quickest fix** to the **most robust long-term solution**. For each solution:
- Give it a title with difficulty level: **(Easy)**, **(Medium)**, or **(Advanced)**
- Explain clearly why this solution works
- Include **actual code examples** with proper syntax highlighting (use \`\`\`yaml, \`\`\`bash, \`\`\`php, etc.)
- Show exactly what to change (file paths, line changes, config modifications)

### 4. 🛡️ Prevention
How to prevent this type of failure in the future. Include specific CI/CD best practices relevant to this error.

### 5. 📋 Quick Fix Checklist
A numbered checklist of the exact steps to fix this issue right now.

Be thorough, specific, and technical. Reference actual file names, error messages, and code from the context provided. Avoid generic advice.`;

  return prompt;
};

export interface CommitContext {
  repoName: string;
  sha: string;
  author: string;
  message: string;
  date: string;
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

export const buildCommitPrompt = (ctx: CommitContext): string => {
  let prompt = `You are a senior software engineer performing a deep code audit. Analyze this commit and provide a comprehensive impact assessment, security review, and quality analysis.

## Commit Details
- **Repository:** ${ctx.repoName}
- **SHA:** ${ctx.sha}
- **Author:** ${ctx.author}
- **Date:** ${ctx.date}
- **Message:** ${ctx.message}

## Files Changed (${ctx.files.length})
`;

  ctx.files.forEach((f) => {
    prompt += `- \`${f.filename}\` (+${f.additions}, -${f.deletions}) [${f.status}]\n`;
  });

  const filesWithPatches = ctx.files.filter((f) => f.patch);
  if (filesWithPatches.length > 0) {
    prompt += `\n## Code Changes (Diff Patches)\n`;
    filesWithPatches.forEach((f) => {
      const patch = (f.patch || "").substring(0, 2500);
      prompt += `\n### ${f.filename}\n\`\`\`diff\n${patch}\n\`\`\`\n`;
    });
  }

  prompt += `
---

## Instructions

Provide your audit in **Markdown format** with the following structure:

### 1. 📊 Change Summary
Summarize what this commit does at a high level. Categorize changes by layer (frontend, backend, database, config, tests).

### 2. 🔴 Impact Analysis
Analyze the architectural and downstream impact of these changes. What could break? What depends on the modified code?

### 3. 🔒 Security Review
Scan the patches for security issues: hardcoded secrets, XSS risks, SQL injection, insecure patterns. If clean, confirm explicitly.

### 4. 🧪 Test Coverage Assessment
Are the changes covered by tests? Were test files modified? What tests should be added?

### 5. ⚠️ Risk Rating
Rate the risk: LOW / MEDIUM / HIGH with justification.

### 6. 💡 Recommendations
Specific suggestions for improvement. Include code examples if relevant.

Be thorough and reference actual file names and code changes from the patches provided.`;

  return prompt;
};

// ─── Streaming API Calls ─────────────────────────────────────────────────────

export const streamGeminiResponse = async (
  model: string,
  prompt: string,
  onChunk: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API key is not configured. Please add your API key in the settings above.");

  const modelId = GEMINI_MODEL_MAP[model] || model;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
      signal,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream available");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.substring(6);
        if (jsonStr === "[DONE]") continue;
        try {
          const data = JSON.parse(jsonStr);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) {
            fullText += text;
            onChunk(fullText);
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }

  return fullText;
};

export const streamClaudeResponse = async (
  model: string,
  prompt: string,
  onChunk: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("Anthropic API key is not configured. Please add your API key in the settings above.");

  const modelId = CLAUDE_MODEL_MAP[model] || model;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8192,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream available");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.substring(6);
        if (jsonStr === "[DONE]") continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === "content_block_delta" && data.delta?.text) {
            fullText += data.delta.text;
            onChunk(fullText);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  return fullText;
};

// ─── Unified Stream Dispatcher ───────────────────────────────────────────────

export const streamAIResponse = async (
  model: string,
  prompt: string,
  onChunk: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  if (isGeminiModel(model)) {
    return streamGeminiResponse(model, prompt, onChunk, signal);
  } else if (isClaudeModel(model)) {
    return streamClaudeResponse(model, prompt, onChunk, signal);
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
};
