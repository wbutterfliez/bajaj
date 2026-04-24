const express = require("express");
const cors = require("cors");
const vessel = express();
vessel.use(cors());
vessel.use(express.json());
vessel.use(express.static("public"));
const STAMP = {
  user_id: "didhitirai_28062005",
  email_id: "dr2603@srmist.edu.in",
  college_roll_number: "RA2311003011013",
};
const ARROW_GLYPH = /^([A-Z])->([A-Z])$/;

function isLegitEdge(raw) {
  const snipped = raw.trim();
  return ARROW_GLYPH.test(snipped);
}
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
function spotCycle(startNode, kidsMap) {
  const palette = {}; 
  let cycleFound = false;
  function dfs(node) {
    if (cycleFound) return;
    palette[node] = 1;
    for (const offspring of (kidsMap[node] || [])) {
      if (!palette[offspring]) dfs(offspring);
      else if (palette[offspring] === 1) { cycleFound = true; return; }
    }
    palette[node] = 2;
  }
  for (const n of Object.keys(kidsMap)) {
    if (!palette[n]) dfs(n);
  }
  return cycleFound;
}
function sculpt(node, kidsMap, visited = new Set()) {
  if (visited.has(node)) return {};
  visited.add(node);
  const branch = {};
  for (const kid of (kidsMap[node] || [])) {
    branch[kid] = sculpt(kid, kidsMap, visited);
  }
  return branch;
}
function measureDepth(node, kidsMap, memo = {}) {
  if (memo[node] !== undefined) return memo[node];
  const sprouts = kidsMap[node] || [];
  if (sprouts.length === 0) return (memo[node] = 1);
  return (memo[node] = 1 + Math.max(...sprouts.map(k => measureDepth(k, kidsMap, memo))));
}
vessel.get("/", (req, res) => {
  res.send("BFHL API is alive 🚀");
});
vessel.post("/bfhl", (req, res) => {
  const incoming = req.body?.data;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: "data must be an array" });
  }
  const illegalBin = [];
  const cloneBin = []; 
  const seenPairs = new Set();
  const legitEdges = [];
  for (const chunk of incoming) {
    const trimmed = typeof chunk === "string" ? chunk.trim() : "";
    if (!isLegitEdge(trimmed)) {
      const selfLoopGuard = trimmed.match(/^([A-Z])->([A-Z])$/);
      if (selfLoopGuard && selfLoopGuard[1] === selfLoopGuard[2]) {
        illegalBin.push(chunk);
      } else {
        illegalBin.push(chunk);
      }
      continue;
    }
    const [, papa, bambino] = trimmed.match(ARROW_GLYPH);
    if (papa === bambino) {
      illegalBin.push(chunk);
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
  const kidsOf = {};   
  const parentOf = {}; 
  const allNodes = new Set();
  for (const [papa, bambino] of legitEdges) {
    allNodes.add(papa);
    allNodes.add(bambino);
    if (!kidsOf[papa]) kidsOf[papa] = [];
    if (parentOf[bambino] !== undefined) continue;
    parentOf[bambino] = papa;
    kidsOf[papa].push(bambino);
  }
  const uf = makeUnionFind([...allNodes]);
  for (const [papa, bambino] of legitEdges) uf.merge(papa, bambino);
  const clusters = {};
  for (const node of allNodes) {
    const chief = uf.climb(node);
    if (!clusters[chief]) clusters[chief] = new Set();
    clusters[chief].add(node);
  }
  const hierarchies = [];
  for (const clusterNodes of Object.values(clusters)) {
    const localKids = {};
    for (const node of clusterNodes) {
      if (kidsOf[node]) localKids[node] = kidsOf[node].filter(k => clusterNodes.has(k));
    }
    const rootCandidates = [...clusterNodes].filter(n => parentOf[n] === undefined || !clusterNodes.has(parentOf[n]));
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
  hierarchies.sort((a, b) => a.root.localeCompare(b.root));
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
vessel.listen(DOCK, "0.0.0.0", () => console.log(`BFHL vessel sailing on port ${DOCK}`));