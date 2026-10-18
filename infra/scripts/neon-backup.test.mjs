import test from "node:test";
import assert from "node:assert/strict";
import { branchesToDelete, findBranchByName } from "./neon-backup.mjs";

const branch = (id, name, day, isDefault = false) => ({
  id,
  name,
  default: isDefault,
  created_at: `2026-01-0${day}T00:00:00Z`,
});

test("keeps newest 3 pre-migrate branches", () => {
  const branches = [
    branch("b3", "pre-migrate-c", 3),
    branch("b1", "pre-migrate-a", 1),
    branch("b5", "pre-migrate-e", 5),
    branch("b2", "pre-migrate-b", 2),
    branch("b4", "pre-migrate-d", 4),
  ];
  assert.deepEqual(branchesToDelete(branches, 3).sort(), ["b1", "b2"]);
});

test("never deletes non-prefixed branches", () => {
  const branches = [
    branch("m", "main", 1, true),
    branch("d", "dev", 1),
    branch("p1", "pre-migrate-a", 2),
    branch("p2", "pre-migrate-b", 3),
  ];
  assert.deepEqual(branchesToDelete(branches, 1), ["p1"]);
});

test("never deletes the default branch even if prefixed", () => {
  const branches = [
    branch("x", "pre-migrate-x", 1, true),
    branch("p1", "pre-migrate-a", 2),
    branch("p2", "pre-migrate-b", 3),
  ];
  assert.deepEqual(branchesToDelete(branches, 1), ["p1"]);
});

test("returns [] when at or under keep", () => {
  const branches = [
    branch("p1", "pre-migrate-a", 1),
    branch("p2", "pre-migrate-b", 2),
    branch("p3", "pre-migrate-c", 3),
  ];
  assert.deepEqual(branchesToDelete(branches, 3), []);
  assert.deepEqual(branchesToDelete(branches.slice(0, 2), 3), []);
});

test("findBranchByName matches the exact name only", () => {
  const branches = [
    branch("p1", "pre-migrate-abc", 1),
    branch("p2", "pre-migrate-abcd", 2),
  ];
  assert.equal(findBranchByName(branches, "pre-migrate-abc")?.id, "p1");
  assert.equal(findBranchByName(branches, "pre-migrate-ab"), undefined);
});
