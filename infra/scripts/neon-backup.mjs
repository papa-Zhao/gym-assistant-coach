const API_BASE = "https://console.neon.tech/api/v2";
const PREFIX = "pre-migrate-";
const KEEP = 3;
const OPERATION_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

/**
 * Ids of pre-migrate branches beyond the newest `keep`.
 * Never returns the default branch or branches without the prefix.
 */
export function branchesToDelete(branches, keep) {
  return branches
    .filter((b) => !b.default && b.name.startsWith(PREFIX))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(keep)
    .map((b) => b.id);
}

/** The branch with exactly this name, or undefined. */
export function findBranchByName(branches, name) {
  return branches.find((b) => b.name === name);
}

function createClient(apiKey, projectId) {
  const base = `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  // Errors carry method, path and status only; never headers or the key.
  async function request(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Neon API ${method} ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
  }
  return { request };
}

async function waitForOperations(client, operations) {
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  for (const op of operations ?? []) {
    let status = op.status;
    while (status !== "finished" && status !== "skipped") {
      if (status === "error" || status === "failed" || status === "cancelled") {
        throw new Error(`Neon operation ${op.id} ${status}`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for Neon operation ${op.id}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const res = await client.request("GET", `/operations/${op.id}`);
      status = res.operation.status;
    }
  }
}

export async function backup({ apiKey, projectId, sha }) {
  const client = createClient(apiKey, projectId);
  const name = `${PREFIX}${sha}`;

  const existing = await client.request("GET", "/branches");
  if (findBranchByName(existing.branches, name)) {
    console.log(`Neon backup branch ${name} already exists, reusing`);
  } else {
    const created = await client.request("POST", "/branches", {
      branch: { name },
    });
    await waitForOperations(client, created.operations);
    console.log(`Created Neon branch ${name}`);
  }

  const { branches } = await client.request("GET", "/branches");
  for (const id of branchesToDelete(branches, KEEP)) {
    const deleted = await client.request("DELETE", `/branches/${id}`);
    await waitForOperations(client, deleted.operations);
    console.log(`Deleted old Neon branch ${id}`);
  }
}

if (import.meta.main) {
  const sha = process.argv[2];
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!sha || !apiKey || !projectId) {
    console.error(
      "Usage: NEON_API_KEY=... NEON_PROJECT_ID=... node neon-backup.mjs <sha>",
    );
    process.exit(2);
  }
  try {
    await backup({ apiKey, projectId, sha });
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Neon backup failed");
    process.exit(1);
  }
}
