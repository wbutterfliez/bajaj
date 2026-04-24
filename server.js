const express = require("express");
const cors = require("cors");

const vessel = express();
vessel.use(cors());
vessel.use(express.json());
vessel.use(express.static("public"));

// ── YOUR CREDENTIALS ──────────────────────────────────────────
const STAMP = {
  user_id: "didhitirai_28062005",
  email_id: "dr2603@srmist.edu.in",
  college_roll_number: "RA2311003011013",
};
// ─────────────────────────────────────────────────────────────

/** Regex: single uppercase letter -> single uppercase letter */
const ARROW_GLYPH = /^([A-Z])->([A-Z])$/;

/**
 * Returns true if raw string (after trim) is a valid edge.
 * Catches: self-loops, bad separators, multi-char, numerics, empty, missing child.
 */
function isLegitEdge(raw) {
  const snipped = raw.trim();
  return ARROW_GLYPH.test(snipped);
}

/**
 * Union-Find helpers to detect cycles & group nodes.
 */
function makeUnionFind(nodes) {
  const ancestor = {};
  const rank = {};
  for (const n of nodes) { ancestor[n] = n; rank[n] = 0; }

  function climb(x) {
    if (ancestor[x] !== x) ancestor[x] = climb(ancestor[x]);
    return ancestor[x];
  }
  function merge(a, b) {
    const ra = climb(a), rb = climb(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) ancestor[ra] = rb;
    else if (rank[ra] > rank[rb]) ancestor[rb] = ra;
    else { ancestor[rb] = ra; rank[ra]++; }
  }
  return { climb, merge };
}

/**
 * DFS-based cycle checker within a subgraph of edges.
 */
// function spotCycle(startNode, kidsMap) {
//   const palette = {}; // 0=untouched, 1=in-stack, 2=done
//   let cycleFound = false;

//   function dfs(node) {
//     if (cycleFound) return;
//     palette[node] = 1;
//     for (const offspring of (kidsMap[node] || [])) {
//       if (!palette[offspring]) dfs(offspring);
//       else if (palette[offspring] === 1) { cycleFound = true; return; }
//     }
//     palette[node] = 2;
//   }

//   for (const n of Object.keys(kidsMap)) {
//     if (!palette[n]) dfs(n);
//   }
//   return cycleFound;
// }
function spotCycle(kidsMap) {
  const palette = {}; // 0=unvisited, 1=visiting, 2=done
  let cycleFound = false;

  function dfs(node) {
    if (cycleFound) return;
    palette[node] = 1;

    for (const child of (kidsMap[node] || [])) {
      if (!palette[child]) {
        dfs(child);
      } else if (palette[child] === 1) {
        cycleFound = true;
        return;
      }
    }

    palette[node] = 2;
  }

  // 🔥 KEY FIX: check ALL nodes in the component
  for (const node of Object.keys(kidsMap)) {
    if (!palette[node]) dfs(node);
  }

  return cycleFound;
}

/**
 * Recursively builds the nested tree object.
 */
function sculpt(node, kidsMap, visited = new Set()) {
  if (visited.has(node)) return {};
  visited.add(node);
  const branch = {};
  for (const kid of (kidsMap[node] || [])) {
    branch[kid] = sculpt(kid, kidsMap, visited);
  }
  return branch;
}

/**
 * Longest root-to-leaf node count (depth).
 */
function measureDepth(node, kidsMap, memo = {}) {
  if (memo[node] !== undefined) return memo[node];
  const sprouts = kidsMap[node] || [];
  if (sprouts.length === 0) return (memo[node] = 1);
  return (memo[node] = 1 + Math.max(...sprouts.map(k => measureDepth(k, kidsMap, memo))));
}

// ── MAIN ROUTE ────────────────────────────────────────────────
vessel.post("/bfhl", (req, res) => {
  const incoming = req.body?.data;

  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: "data must be an array" });
  }

  const illegalBin = [];   // invalid_entries
  const cloneBin = [];     // duplicate_edges
  const seenPairs = new Set();
  const legitEdges = [];   // valid, non-duplicate [parent, child] pairs

  for (const chunk of incoming) {
    const trimmed = typeof chunk === "string" ? chunk.trim() : "";

    if (!isLegitEdge(trimmed)) {
      // Self-loop check included in regex (A->A would match but we want invalid)
      // Actually A->A: both sides same letter — add explicit guard
      const selfLoopGuard = trimmed.match(/^([A-Z])->([A-Z])$/);
      if (selfLoopGuard && selfLoopGuard[1] === selfLoopGuard[2]) {
        illegalBin.push(chunk); // self-loop = invalid
      } else {
        illegalBin.push(chunk);
      }
      continue;
    }

    const [, papa, bambino] = trimmed.match(ARROW_GLYPH);

    if (papa === bambino) {
      illegalBin.push(chunk); // self-loop
      continue;
    }

    const pairKey = `${papa}->${bambino}`;
    if (seenPairs.has(pairKey)) {
      if (!cloneBin.includes(pairKey)) cloneBin.push(pairKey);
      continue;
    }
    seenPairs.add(pairKey);
    legitEdges.push([papa, bambino]);
  }

  // ── Build adjacency & track parenthood ────────────────────
  const kidsOf = {};   // parent -> [children]  (first-parent-wins)
  const parentOf = {}; // child -> parent        (first-parent-wins)
  const allNodes = new Set();

  for (const [papa, bambino] of legitEdges) {
    allNodes.add(papa);
    allNodes.add(bambino);
    if (!kidsOf[papa]) kidsOf[papa] = [];
    // Multi-parent: if bambino already has a parent, silently drop
    if (parentOf[bambino] !== undefined) continue;
    parentOf[bambino] = papa;
    kidsOf[papa].push(bambino);
  }

  // ── Group nodes using Union-Find ──────────────────────────
  const uf = makeUnionFind([...allNodes]);
  for (const [papa, bambino] of legitEdges) uf.merge(papa, bambino);

  const clusters = {}; // ancestorKey -> Set of nodes
  for (const node of allNodes) {
    const chief = uf.climb(node);
    if (!clusters[chief]) clusters[chief] = new Set();
    clusters[chief].add(node);
  }

  // ── Build hierarchy objects ───────────────────────────────
  const hierarchies = [];

  for (const clusterNodes of Object.values(clusters)) {
    // Identify root(s): nodes with no parent within this cluster
    const localKids = {};
    for (const node of clusterNodes) {
      if (kidsOf[node]) localKids[node] = kidsOf[node].filter(k => clusterNodes.has(k));
    }

    const rootCandidates = [...clusterNodes].filter(n => parentOf[n] === undefined || !clusterNodes.has(parentOf[n]));

    // If no root (pure cycle), pick lexicographically smallest
    const chosenRoot = rootCandidates.length > 0
      ? rootCandidates.sort()[0]
      : [...clusterNodes].sort()[0];

    const hasCycle = spotCycle(localKids);

    if (hasCycle) {
      hierarchies.push({ root: chosenRoot, tree: {}, has_cycle: true });
    } else {
      const treeBlob = { [chosenRoot]: sculpt(chosenRoot, localKids) };
      const depthVal = measureDepth(chosenRoot, localKids);
      hierarchies.push({ root: chosenRoot, tree: treeBlob, depth: depthVal });
    }
  }

  // Sort hierarchies by root alphabetically for consistency
  hierarchies.sort((a, b) => a.root.localeCompare(b.root));

  // ── Summary ───────────────────────────────────────────────
  const validTrees = hierarchies.filter(h => !h.has_cycle);
  const cyclicGroups = hierarchies.filter(h => h.has_cycle);

  let bigTreeRoot = "";
  if (validTrees.length > 0) {
    const champ = validTrees.reduce((best, curr) => {
      if (curr.depth > best.depth) return curr;
      if (curr.depth === best.depth && curr.root < best.root) return curr;
      return best;
    });
    bigTreeRoot = champ.root;
  }

  return res.json({
    ...STAMP,
    hierarchies,
    invalid_entries: illegalBin,
    duplicate_edges: cloneBin,
    summary: {
      total_trees: validTrees.length,
      total_cycles: cyclicGroups.length,
      largest_tree_root: bigTreeRoot,
    },
  });
});

const DOCK = process.env.PORT || 3000;
vessel.listen(DOCK, () => console.log(`⚡ BFHL vessel sailing on port ${DOCK}`));