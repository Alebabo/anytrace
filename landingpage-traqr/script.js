(function () {
  const NODES = [
    { id: "accel",  label: "Accel",      sub: "VC",      kind: "vc",     r: 38, avatar: "AC" },
    { id: "hv",     label: "HV Capital", sub: "VC",      kind: "vc",     r: 34, avatar: "HV" },
    { id: "speed",  label: "Speedinvest",sub: "VC",      kind: "vc",     r: 30, avatar: "SP" },
    { id: "early",  label: "Earlybird",  sub: "VC",      kind: "vc",     r: 30, avatar: "EB" },
    { id: "nina",   label: "Nina H.",    sub: "Founder", kind: "person", r: 26, avatar: "NH" },
    { id: "jan",    label: "Jan M.",     sub: "Builder", kind: "person", r: 22, avatar: "JM" },
    { id: "felix",  label: "Felix K.",   sub: "Founder", kind: "person", r: 24, avatar: "FK" },
    { id: "sarah",  label: "Sarah L.",   sub: "Founder", kind: "person", r: 22, avatar: "SL" },
    { id: "repo",   label: "core/api",   sub: "GitHub",  kind: "repo",   r: 22, avatar: "GH" },
  ];

  const LINKS = [
    { source: "accel", target: "nina"  },
    { source: "hv",    target: "nina"  },
    { source: "speed", target: "nina"  },
    { source: "accel", target: "jan"   },
    { source: "hv",    target: "felix" },
    { source: "early", target: "felix" },
    { source: "speed", target: "sarah" },
    { source: "early", target: "sarah" },
    { source: "nina",  target: "repo"  },
    { source: "jan",   target: "repo"  },
  ];

  function nodeColor(d) {
    if (d.kind === "vc")     return "#14312f";
    if (d.kind === "repo")   return "#edf2ed";
    return "#fcfbf8";
  }
  function nodeStroke(d) {
    return d.kind === "vc" ? "#0a2522" : "#d8d2c6";
  }
  function textColor(d) {
    return d.kind === "vc" ? "#ffffff" : "#14312f";
  }

  function initGraph() {
    const svgEl = document.getElementById("graph-svg");
    const tooltip = document.getElementById("graph-tooltip");
    if (!svgEl || typeof d3 === "undefined") return;

    const wrap = svgEl.parentElement;
    const W = wrap.clientWidth || 820;
    const H = parseInt(getComputedStyle(svgEl).height) || 420;

    const svg = d3.select(svgEl)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Defs
    const defs = svg.append("defs");
    const glowFilter = defs.append("filter").attr("id", "at-glow").attr("x", "-40%").attr("y", "-40%").attr("width", "180%").attr("height", "180%");
    glowFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "4").attr("result", "blur");
    const glowMerge = glowFilter.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const nodes = NODES.map(n => ({ ...n }));
    const links = LINKS.map(l => ({ ...l }));

    // Link layer
    const linkG = svg.append("g").attr("class", "links");
    const linkSel = linkG.selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#d8d2c6")
      .attr("stroke-width", 1.5)
      .attr("stroke-linecap", "round");

    // Node layer
    const nodeG = svg.append("g").attr("class", "nodes");
    const nodeSel = nodeG.selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab");

    nodeSel.append("circle")
      .attr("r", d => d.r)
      .attr("fill", nodeColor)
      .attr("stroke", nodeStroke)
      .attr("stroke-width", 1.5);

    nodeSel.append("text")
      .attr("class", "avatar-text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", textColor)
      .attr("font-size", d => Math.round(d.r * 0.54))
      .attr("font-family", "Geist, system-ui, sans-serif")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text(d => d.avatar);

    nodeSel.append("text")
      .attr("class", "label-text")
      .attr("text-anchor", "middle")
      .attr("y", d => d.r + 14)
      .attr("fill", "#45625d")
      .attr("font-size", "10")
      .attr("font-family", "Geist, system-ui, sans-serif")
      .attr("pointer-events", "none")
      .text(d => d.label);

    // Force simulation
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(130).strength(0.45))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(W / 2, H / 2 - 10))
      .force("collide", d3.forceCollide(d => d.r + 28))
      .on("tick", ticked);

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function ticked() {
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeSel.attr("transform", d =>
        `translate(${clamp(d.x, d.r + 8, W - d.r - 8)},${clamp(d.y, d.r + 8, H - d.r - 28)})`
      );
    }

    // Drag
    nodeSel.call(
      d3.drag()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    // Connection lookup
    function connectedSet(node) {
      const s = new Set([node.id]);
      links.forEach(l => {
        if (l.source.id === node.id) s.add(l.target.id);
        if (l.target.id === node.id) s.add(l.source.id);
      });
      return s;
    }

    function connectionCount(node) {
      return links.filter(l => l.source.id === node.id || l.target.id === node.id).length;
    }

    // Hover
    nodeSel
      .on("mouseenter", function (event, d) {
        const connected = connectedSet(d);
        nodeSel
          .attr("opacity", n => connected.has(n.id) ? 1 : 0.15)
          .filter(n => n.id === d.id)
          .select("circle")
          .attr("filter", "url(#at-glow)");

        linkSel
          .attr("opacity", l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.06)
          .attr("stroke", l => (l.source.id === d.id || l.target.id === d.id) ? "#14312f" : "#d8d2c6")
          .attr("stroke-width", l => (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 1.5);

        if (tooltip) {
          const count = connectionCount(d);
          tooltip.innerHTML = `<strong>${d.label}</strong><span>${d.sub} · ${count} connection${count !== 1 ? "s" : ""}</span>`;
          tooltip.classList.add("is-visible");
          positionTooltip(event);
        }
      })
      .on("mousemove", function (event) {
        if (tooltip) positionTooltip(event);
      })
      .on("mouseleave", function () {
        nodeSel.attr("opacity", 1).select("circle").attr("filter", null);
        linkSel.attr("opacity", 1).attr("stroke", "#d8d2c6").attr("stroke-width", 1.5);
        if (tooltip) tooltip.classList.remove("is-visible");
      });

    function positionTooltip(event) {
      const rect = wrap.getBoundingClientRect();
      let x = event.clientX - rect.left + 14;
      let y = event.clientY - rect.top - 10;
      if (x + 180 > W) x -= 200;
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
    }

    // Resize
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newW = wrap.clientWidth || 820;
        svg.attr("viewBox", `0 0 ${newW} ${H}`);
        sim.force("center", d3.forceCenter(newW / 2, H / 2 - 10));
        sim.alpha(0.3).restart();
      }, 200);
    });
  }

  // Wait for D3 to be available (defer order)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGraph);
  } else {
    initGraph();
  }
})();