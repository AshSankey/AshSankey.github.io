d3.sankey = () => {
  "use strict";

  const sankey = {},
    // Set up some handy constants (acting as enums)
    // These numbers are relatively prime so each cross-product is unique
    // (when we need that)
    [SOURCES, TARGETS, TOP, BOTTOM, NEAREST] = [2, 3, 5, 7, 11];

  // Set by inputs:
  let nodeWidth = 9,
    nodeHeightFactor = 0.5,
    nodeSpacingFactor = 0.85,
    size = { w: 1, h: 1 },
    nodes = [],
    flows = [],
    rightJustifyEndpoints = false,
    leftJustifyOrigins = false,
    autoLayout = true,
    attachIncompletesTo = NEAREST,
    // Calculated:
    stagesArr = [],
    maximumNodeSpacing = 0,
    actualNodeSpacing = 0,
    maxStage = -1;

  // ACCESSORS //
  /* eslint-disable func-names */
  sankey.nodeWidth = function (x) {
    if (arguments.length) {
      nodeWidth = +x;
      return sankey;
    }
    return nodeWidth;
  };

  sankey.nodeHeightFactor = function (x) {
    if (arguments.length) {
      nodeHeightFactor = +x;
      return sankey;
    }
    return nodeHeightFactor;
  };

  sankey.nodeSpacingFactor = function (x) {
    if (arguments.length) {
      nodeSpacingFactor = +x;
      return sankey;
    }
    return nodeSpacingFactor;
  };

  sankey.nodes = function (x) {
    if (arguments.length) {
      nodes = x;
      return sankey;
    }
    return nodes;
  };

  sankey.flows = function (x) {
    if (arguments.length) {
      flows = x;
      return sankey;
    }
    return flows;
  };

  sankey.size = function (x) {
    if (arguments.length) {
      size = x;
      return sankey;
    }
    return size;
  };

  sankey.rightJustifyEndpoints = function (x) {
    if (arguments.length) {
      rightJustifyEndpoints = x;
      return sankey;
    }
    return rightJustifyEndpoints;
  };

  sankey.leftJustifyOrigins = function (x) {
    if (arguments.length) {
      leftJustifyOrigins = x;
      return sankey;
    }
    return leftJustifyOrigins;
  };

  sankey.autoLayout = function (x) {
    if (arguments.length) {
      autoLayout = x;
      return sankey;
    }
    return autoLayout;
  };

  sankey.attachIncompletesTo = function (x) {
    if (arguments.length) {
      switch (x.toLowerCase()) {
        case "leading":
          attachIncompletesTo = TOP;
          break;
        case "trailing":
          attachIncompletesTo = BOTTOM;
          break;
        case "nearest":
          attachIncompletesTo = NEAREST;
          break;
        // no default
      }
      return sankey;
    }
    return attachIncompletesTo;
  };

  // Getters:
  sankey.stages = () => stagesArr;

  // FUNCTIONS //

  // valueSum: Add up all the 'value' keys from a list of objects:
  function valueSum(list) {
    return d3.sum(list, (d) => d.value);
  }

  // divide: Substitute MIN_VALUE if a denominator would be 0:
  function divide(a, b) {
    return a / (b || Number.MIN_VALUE);
  }

  // yCenter & yBottom: Y-position of the middle and end of a node.
  function yCenter(n) {
    return n.y + n.dy / 2;
  }
  function yBottom(n) {
    return n.y + n.dy;
  }

  // source___/target___: return the ___ of one end of a flow:
  function sourceTop(f) {
    return f.source.y + f.sy;
  }
  function targetTop(f) {
    return f.target.y + f.ty;
  }
  function sourceCenter(f) {
    return f.source.y + f.sy + f.dy / 2;
  }
  function targetCenter(f) {
    return f.target.y + f.ty + f.dy / 2;
  }
  function sourceBottom(f) {
    return f.source.y + f.sy + f.dy;
  }
  function targetBottom(f) {
    return f.target.y + f.ty + f.dy;
  }

  // Get the extreme bounds across a list of Nodes:
  function leastY(nodeList) {
    return d3.min(nodeList, (n) => n.y);
  }
  function greatestY(nodeList) {
    return d3.max(nodeList, (n) => yBottom(n));
  }

  // Sorting functions:
  function bySourceOrder(a, b) {
    return a.sourceRow - b.sourceRow;
  }
  function byTopEdges(a, b) {
    return a.y - b.y;
  }

  // connectFlowsToNodes: Populate flows in & out for each node.
  function connectFlowsToNodes() {
    // Initialize the flow buckets:
    nodes.forEach((n) => {
      // Lists of flows which use this node as their target or source:
      n.flows = { [IN]: [], [OUT]: [] };
      // Mark these as real nodes we want to see:
      n.isAShadow = false;
    });

    // Connect each flow to its two nodes:
    flows.forEach((f) => {
      // When the source or target is a number, that's an index;
      // convert it to the referenced object:
      if (typeof f.source === "number") {
        f.source = nodes[f.source];
      }
      if (typeof f.target === "number") {
        f.target = nodes[f.target];
      }

      // Add this flow to the affected source & target:
      f.source.flows[OUT].push(f);
      f.target.flows[IN].push(f);
      // By default, real flows are used when sorting/placing within a node.
      f.useForVisiblePlacing = true;
      // Mark these as real flows we want to see:
      f.isAShadow = false;
      f.hasAShadow = false;
    });
  }

  // computeNodeValues: Compute the value of each node by summing the
  // associated flows:
  function computeNodeValues() {
    nodes.forEach((n) => {
      // Remember the totals in & out:
      n.total = { [IN]: valueSum(n.flows[IN]), [OUT]: valueSum(n.flows[OUT]) };
      // Each node's value will be the greater of the two (or else the
      // smallest positive value):
      n.value = Math.max(n.total[IN], n.total[OUT], Number.MIN_VALUE);
    });
  }

  // allFlowStats(nodeList): provides all components necessary to make
  // weighted-center calculations. These are used to decide where a
  // group of nodes would ideally 'want' to be.
  function allFlowStats(nodeList) {
    // flowSetStats: get the total weight+value from a group of flows
    function flowSetStats(whichFlows) {
      // Get every flow touching one side & treat them as one list:
      const flowList = nodeList
        .map((n) => n.flows[whichFlows])
        .flat()
        // Use the weighted value of a flow (this handles shadows):
        .filter((f) => f.weightedValue > 0);
      // If 0 flows, return enough structure to satisfy the caller:
      if (flowList.length === 0) {
        return { value: 0, sources: { weight: 0 }, targets: { weight: 0 } };
      }

      return {
        value: d3.sum(flowList, (f) => f.weightedValue),
        sources: {
          weight: d3.sum(flowList, (f) => sourceCenter(f) * f.weightedValue),
          maxSourceStage: d3.max(flowList, (f) => f.source.stage),
        },
        targets: {
          weight: d3.sum(flowList, (f) => targetCenter(f) * f.weightedValue),
          minTargetStage: d3.min(flowList, (f) => f.target.stage),
        },
      };
    }

    // Return the stats for the set of all flows touching these nodes:
    return { [IN]: flowSetStats(IN), [OUT]: flowSetStats(OUT) };
  }

  // placeFlowsInsideNodes(nodeList):
  //   Compute the y-offset of every flow's source and target endpoints,
  //   relative to the each node's y-position.
  function placeFlowsInsideNodes(nodeList) {
    // sortFlows(node, placing):
    //   Given a node & a side, reorder that group of flows as best we can.
    //   'placing' indicates which end of the flows we're working on here:
    //      - TARGETS = we're placing the targets of n.flows[IN]
    //      - SOURCES = we're placing the sources of n.flows[OUT]
    function sortFlows(n, placing) {
      const dir = placing === TARGETS ? IN : OUT,
        fStats = allFlowStats([n]),
        [flowsToSort, totalFlowValue] = [n.flows[dir], n.total[dir]],
        totalFlowWeight = (
          dir === IN ? fStats[IN].sources : fStats[OUT].targets
        ).weight,
        // Make a Set of flow IDs we can delete from as we go:
        flowsRemaining = new Set(flowsToSort.map((f) => f.index)),
        // Calculate how tall the flow group is which will attach to this
        // node (may be less than n.dy):
        totalFlowSpan = d3.sum(
          // Only count the space which is needed for visible flows (when
          // the node is real) OR for flows meeting a shadow node:
          flowsToSort.filter((f) => !f.isAShadow || n.isAShadow),
          (f) => f.dy
        ),
        // Attach flows to the *top* of the range, *except* when:
        // the entire node's value is not all flowing somewhere, AND
        // - The caller says to attach them to the bottom, OR
        // - The caller says to use the 'nearest' end AND
        //   - the center-of-all-attached-flows is below the node's
        //     own center.
        flowPosition =
          totalFlowValue < n.value &&
          (attachIncompletesTo === BOTTOM ||
            (attachIncompletesTo === NEAREST &&
              divide(totalFlowWeight, totalFlowValue) > yCenter(n)))
            ? BOTTOM
            : TOP,
        // upper/lower bounds = the range where flows may attach
        bounds =
          flowPosition === TOP
            ? { upper: n.y, lower: n.y + totalFlowSpan }
            : { upper: yBottom(n) - totalFlowSpan, lower: yBottom(n) };
      // Reminder: In SVG-land, y-axis coordinates are inverted...
      //   "upper" & "lower" are meant visually here, not numerically.

      // placeFlow(f, y): Update a flow's position
      function placeFlow(f, newTopY) {
        // Is the flow actually in the queue? Exit if not. (This can happen
        // when we're placing a shadow flow and offer to update the original
        // flow's Y, but it's in some other stage.)
        if (!flowsRemaining.has(f.index)) {
          return;
        }
        // sy & ty (source/target y) are the vertical *offsets* at each end
        // of a flow, determining where below the node's top edge the flow's
        // top will meet.
        if (placing === TARGETS) {
          f.ty = newTopY - f.target.y;
        } else {
          f.sy = newTopY - f.source.y;
        }
        // Drop the flow we just placed from the queue:
        flowsRemaining.delete(f.index);
      }

      // placeFlowAt(edge, fIndex):
      //   Update the bound, set this flow's offset, update the queue.
      function placeFlowAt(edge, fIndex) {
        const f = flows[fIndex];
        let newY = 0;
        if (edge === TOP) {
          newY = bounds.upper;
          // If this is real, move the upper bound DOWN.
          if (f.useForVisiblePlacing || n.isAShadow) {
            bounds.upper += f.dy;
          }
        } else {
          // edge === BOTTOM
          // Make room at the bottom of the range for this flow:
          newY = bounds.lower - f.dy;
          // If this is real, move the lower bound UP to match:
          if (f.useForVisiblePlacing || n.isAShadow) {
            bounds.lower = newY;
          }
        }

        // Put the flow where we just decided & drop it from the queue:
        placeFlow(f, newY);

        if (f.useForVisiblePlacing && f.isAShadow) {
          // If this flow should be used for placing a real one AND is a
          // shadow flow, then copy its new position to the true flow & drop
          // that other flow from the queue too:
          placeFlow(flows[f.shadowOf], newY);
        }
      }

      // slopeData keys are the product of an 'edge' & a 'placing' value:
      const slopeData = {
        [TOP * TARGETS]: {
          f: (f) => (bounds.upper - sourceTop(f)) / f.dx,
          dir: -1,
        },
        [TOP * SOURCES]: {
          f: (f) => (targetTop(f) - bounds.upper) / f.dx,
          dir: 1,
        },
        [BOTTOM * TARGETS]: {
          f: (f) => (bounds.lower - sourceBottom(f)) / f.dx,
          dir: 1,
        },
        [BOTTOM * SOURCES]: {
          f: (f) => (targetBottom(f) - bounds.lower) / f.dx,
          dir: -1,
        },
      };

      // placeUnhappiestFlowAt(edge):
      //   Figure out which flow is worst off (slope-wise) and place it.
      //   edge = TOP or BOTTOM
      function placeUnhappiestFlowAt(edge) {
        // The queue may have been drained early. Guard against that:
        if (!flowsRemaining.size) {
          return;
        }
        const sKey = edge * placing,
          slopeOf = slopeData[sKey].f,
          // flowIndex = the ID of the unhappiest flow
          flowIndex = Array.from(flowsRemaining)
            // Exclude flows with shadows; they'll get their position
            // assigned when their shadow gets placed:
            .filter((i) => !flows[i].hasAShadow)
            .sort(
              (a, b) =>
                // For autolayout, use the right slopes in the correct order (asc/dsc):
                (autoLayout
                  ? slopeData[sKey].dir *
                      (slopeOf(flows[a]) - slopeOf(flows[b])) ||
                    // If there is a tie, sort by x-distance (ascending):
                    flows[a].dx - flows[b].dx
                  : 0) ||
                // If we are using exact order (OR if there is still a tie),
                // sort by sourceRow (which is also set for shadow flows)
                flows[a].sourceRow - flows[b].sourceRow
            )[0];
        // If we found a flow, place it at the correct edge:
        if (flowIndex !== undefined) {
          placeFlowAt(edge, flowIndex);
        }
      }

      // Loop through the flow set, placing them from the outside in.
      // If there are at least 2 flows to be placed, we figure out which is
      // best suited to occupy the top & bottom edge spots.
      // After placing those, the remaining range is reduced & we repeat.
      while (flowsRemaining.size > 1) {
        // Place the least fortunate flows, then subtract their size from
        // the available range:
        placeUnhappiestFlowAt(TOP);
        if (autoLayout) {
          placeUnhappiestFlowAt(BOTTOM);
        }
        // (If using exact order, we want to place top->bottom, NOT alternate.)
      }

      // After that loop, we have 0-1 flows. If there is one, place it:
      flowsRemaining.forEach((i) => placeFlowAt(TOP, i));
    }

    // We have the utility functions defined now; time to actually use them.

    // First, update the x-distance (dx) values for all flows -- they may
    // have moved since their initial placement, due to drags. Two notes:
    // 1) We use the *absolute* value of the x-distance, so even when a node
    //    is dragged to the opposite side of a connected node, the ordering
    //    will remain stable.
    // 2) Denominator dx must not be 0, so MIN_VALUE is substituted if needed.
    flows.forEach((f) => {
      f.dx = Math.abs(f.target.x - f.source.x) || Number.MIN_VALUE;
    });

    // Gather all the distinct batches of flows we'll need to process (each
    // node may have 0-2 batches):
    const flowBatches = [
      ...nodeList
        .filter((n) => n.flows[IN].length)
        .map((n) => ({
          i: n.index,
          len: n.flows[IN].length,
          placing: TARGETS,
        })),
      ...nodeList
        .filter((n) => n.flows[OUT].length)
        .map((n) => ({
          i: n.index,
          len: n.flows[OUT].length,
          placing: SOURCES,
        })),
    ];

    // Sort the flow batches so that we start with those having the FEWEST
    // flows and work upward.
    // Reason: a 1-flow placement is certain; a 2-flow set is simple; etc.
    // By settling easier cases first, the harder cases end up with fewer
    // wild possibilities for how they may be arranged.
    flowBatches
      .sort((a, b) => a.len - b.len)
      // Finally: Go through every batch & sort its flows anew:
      .forEach((fBatch) => {
        sortFlows(nodes[fBatch.i], fBatch.placing);
      });
  }

  // assignNodesToStages: Iteratively assign the stage (x-group) for each node.
  // Nodes are assigned the maximum stage of their incoming neighbors + 1,
  // then any nodes which can be nudged forward are.
  function assignNodesToStages() {
    const nodesToCheckAgain = new Set();
    // updateNode: Set a node's stage & make sure its targets get another look.
    function updateNode(n) {
      n.stage = maxStage;
      n.flows[OUT].forEach((f) => {
        nodesToCheckAgain.add(f.target);
      });
    }

    // Work from left to right.
    // Assign every node to stage 0, then keep updating the stage of every node
    // that was a target of a known node. Repeat and fade.
    let nodesToPlace = nodes;
    // The maxStage check is to avoid an infinite loop when there is a cycle:
    while (nodesToPlace.length && maxStage < nodes.length - 1) {
      maxStage += 1;
      nodesToPlace.forEach((n) => updateNode(n));
      nodesToPlace = Array.from(nodesToCheckAgain);
      nodesToCheckAgain.clear();
    }

    // Pull any source nodes to the right which have room to move.
    // First, get a COPY of the list of all nodes with targets:
    nodes
      .filter((n) => n.flows[OUT].length)
      .slice()
      .sort((a, b) => b.stage - a.stage) // Sort that by stage, descending
      .forEach((n) => {
        // Find n's minimum target stage and use the one right before that:
        const maxNewStage = d3.min(n.flows[OUT], (f) => f.target.stage) - 1;
        if (n.stage < maxNewStage) {
          n.stage = maxNewStage;
        }
      });

    // Handle layout checkboxes:
    function setStageWhenNoFlows(direction, newStage) {
      // For nodes with no flows going {direction}...
      nodes
        .filter((n) => !n.flows[direction].length)
        // ...set their stages to newStage:
        .forEach((n) => {
          n.stage = newStage;
        });
    }

    // Force origins to appear all the way to the left?
    if (leftJustifyOrigins) {
      setStageWhenNoFlows(IN, 0);
    }

    // Force endpoints all the way to the right?
    if (rightJustifyEndpoints) {
      setStageWhenNoFlows(OUT, maxStage);
    }

    // Now that the main nodes and flows are in place, we also fill in
    // SHADOW nodes & flows to occupy space whenever stages are skipped.
    // To get started, fill in the 'ds' (stage distance) for all flows:
    flows.forEach((f) => {
      f.ds = f.target.stage - f.source.stage;
    });

    // Next, operate on flows which cross more than one stage:
    const shadowNodeNames = new Map();
    flows
      .filter((f) => Math.abs(f.ds) > 1)
      .forEach((f) => {
        const nodesForThisFlow = [f.source];
        // Duplicate the source node as many times as needed (though only
        // as large as this individual flow)
        for (let i = 1; i < f.ds; i += 1) {
          const shadowStage = f.source.stage + i,
            // Create a custom name for the shadow which will still group
            // multiple flows between the same 2 places.
            newNodeName = `sh_${f.source.index}_${f.target.index}_s${shadowStage}`,
            fVal = Number(f.value);
          let shadowNode;
          // Have we already made a shadow node for this source/target?
          if (shadowNodeNames.has(newNodeName)) {
            // If so, let's add value to the node we've already made:
            shadowNode = nodes[shadowNodeNames.get(newNodeName)];
            shadowNode.value += fVal;
            shadowNode.total[IN] += fVal;
            shadowNode.total[OUT] += fVal;
          } else {
            // A shadow node doesn't exist, so we make a fresh one with the
            // same sourceRow as the original flow:
            shadowNode = {
              index: nodes.length,
              stage: shadowStage,
              name: newNodeName,
              sourceRow: f.sourceRow,
              isAShadow: true,
              flows: { [IN]: [], [OUT]: [] },
              total: { [IN]: fVal, [OUT]: fVal },
              value: fVal,
            };
            // Add this to the big list and to our shadow-tracking list:
            nodes.push(shadowNode);
            shadowNodeNames.set(newNodeName, shadowNode.index);
          }
          nodesForThisFlow.push(shadowNode);
        }
        nodesForThisFlow.push(f.target);

        // Now that we have a list of all nodes along the way, add shadow
        // flows between each pair (starting from the 2nd item in the list).
        for (let i = 1; i < nodesForThisFlow.length; i += 1) {
          const sourceNode = nodesForThisFlow[i - 1],
            targetNode = nodesForThisFlow[i],
            origSourceRow = Number(f.sourceRow),
            // Take values from the original flow, then override some:
            newFlow = {
              ...f,
              source: sourceNode,
              target: targetNode,
              index: flows.length,
              shadowOf: f.index,
              isAShadow: true,
              hasAShadow: false,
              // Make artificial sourceRow numbers so these get prioritized
              // *with* the original flow:
              sourceRow: origSourceRow + i / (f.ds + 1),
              // Should we propagate this shadow's y position to the original
              // flow? Only at the ends of the shadow path.
              useForVisiblePlacing:
                sourceNode.stage === f.source.stage ||
                targetNode.stage === f.target.stage,
            };
          flows.push(newFlow);
          newFlow.source.flows[OUT].push(newFlow);
          newFlow.target.flows[IN].push(newFlow);
        }

        // Now that we're done adopting various values from original flow f,
        // tell f itself that Things have Changed:
        f.useForVisiblePlacing = false;
        f.hasAShadow = true;
      });
  }

  // Set up stagesArr: one array element for each stage, containing that
  // stage's nodes, in stage order.
  // This can also be called when nodes' info may have been updated elsewhere
  // & we need a fresh map generated.
  function updateStagesArray() {
    stagesArr = d3
      .groups(nodes, (d) => d.stage) // [stage, [nodes]]
      .sort((a, b) => a[0] - b[0])
      // Extract each stage and sort its nodes by sourceRow.
      // (This raises shadow nodes to the same rank the original flow is at)
      .map((d) => d[1].sort(bySourceOrder)); // [[nodes]]
  }

  // placeNodes(iterations):
  //   Set (and then adjust) the y-position for each node and flow, based
  //   on their connections to other points in the diagram.
  function placeNodes(iterations) {
    // nodeSetStats(nodeList):
    //   Get the total weight+value from an assortment of Nodes.
    //   The Nodes are expected to all be in the same Stage.
    function nodeSetStats(nodeList) {
      const weight = d3.sum(nodeList, (n) => yCenter(n) * n.value),
        value = valueSum(nodeList);
      return {
        stage: nodeList[0].stage,
        weight: weight,
        value: value,
        center: divide(weight, value),
      };
    }

    // Set up the scaling factor and the initial x & y of all the Nodes:
    function initializeNodePositions() {
      // First, calculate the spacing values.
      // How many nodes are in the 'busiest' stage?
      const greatestNodeCount = d3.max(stagesArr, (s) => s.length);

      let ky = 0;
      // Special case: What if there's only one node in every stage?
      // That calculation is very different:
      if (greatestNodeCount === 1) {
        [maximumNodeSpacing, actualNodeSpacing] = [0, 0];
        ky =
          nodeHeightFactor *
          d3.min(stagesArr, (s) => divide(size.h, valueSum(s)));
      } else {
        // What if each node in the busiest stage got 1 pixel?
        // Figure out how many pixels would be left over.
        // (If pixels < 2, use 2; otherwise the slider has nothing to do.)
        const allAvailablePadding = Math.max(2, size.h - greatestNodeCount);

        // A nodeHeightFactor of 0 means: 'pad as much as possible
        // without making any node less than 1 pixel tall'.
        // Formula for the initial spacing value when nHF = 0:
        //   allAvailablePadding / (# of spaces in the busiest stage)
        maximumNodeSpacing =
          ((1 - nodeHeightFactor) * allAvailablePadding) /
          (greatestNodeCount - 1);
        actualNodeSpacing = maximumNodeSpacing * nodeSpacingFactor;
        // Finally, calculate the vertical scaling factor for all
        // nodes, given maximumNodeSpacing & the diagram's height:
        ky = d3.min(stagesArr, (s) =>
          divide(size.h - (s.length - 1) * maximumNodeSpacing, valueSum(s))
        );
      }
      if (ky === Infinity) {
        ky = 1;
      } // This happens if all Node values are 0

      // Compute all the dy & weighted values using the now-known scale
      // of the graph:
      flows.forEach((f) => {
        f.dy = f.value * ky;
        f.weightedValue = f.hasAShadow ? 0 : f.value;
      });
      // Also: Ensure each node has a nonzero height:
      nodes.forEach((n) => {
        n.dy = Math.max(n.value * ky, Number.MIN_VALUE);
      });

      // Set the initial positions of all nodes within each stage.
      // The initial stage will start with all nodes centered vertically,
      // separated by the actualNodeSpacing.
      // Each stage afterwards will center on its combined source nodes.
      let targetY;
      stagesArr.forEach((s, stageIndex) => {
        const stageSize = valueSum(s) * ky + actualNodeSpacing * (s.length - 1);
        targetY = size.h / 2; // default case = center this batch of nodes
        // If we have any flows into the current set of nodes, we have a
        // chicken/egg problem: We want to use weighted centers based on
        // flows (i.e. flowSetStats), but at this point 0 flows are placed.
        // Simpler approach: use the weighted center of nodes flowing in.
        const allFlowsIn = s.map((n) => n.flows[IN]).flat();
        if (allFlowsIn.length > 0) {
          const uniqueSourceNodes = new Set(
            allFlowsIn
              .map((f) => f.source)
              // Since shadows are in every stage, don't look back more than
              // 1 stage. (And self-loops may mean there are flows from the
              // *same* stage, currently.)
              .filter((n) => n.stage >= stageIndex - 1)
          );
          targetY = nodeSetStats(Array.from(uniqueSourceNodes)).center;
        }

        // Calculate the first-node-in-this-stage's y position (while not
        // letting it be placed where the stage will exceed either boundary):
        let nextNodePos = Math.max(
          0,
          Math.min(targetY - stageSize / 2, size.h - stageSize)
        );
        s.forEach((n) => {
          n.y = nextNodePos;
          // Find the y position of the next node:
          nextNodePos = yBottom(n) + actualNodeSpacing;
        });
      });

      // Set up x-values too.
      // Apply a scaling factor based on width per stage:
      const widthPerStage = maxStage > 0 ? (size.w - nodeWidth) / maxStage : 0;
      nodes.forEach((n) => {
        n.x = widthPerStage * n.stage;
        n.dx = nodeWidth;
      });

      // With nodes placed, we *also* have to provide an initial
      // placement for all flows, so that their weights can be measured
      // realistically in the placeNodes() routine.
      nodes.forEach((n) => {
        // Each flow is initially placed naively, just using the input order.
        // Any misfires will be corrected soon by placeFlowsInsideNodes()
        let [sy, ty] = [0, 0];
        // Shadows touching a real node adopt the same position as their
        // 'true' flow. (NOTE: This works because all shadows initially
        // *follow* all real flows.):
        n.flows[OUT].forEach((f) => {
          if (f.isAShadow && !n.isAShadow) {
            f.sy = flows[f.shadowOf].sy;
          } else {
            f.sy = sy;
            sy += f.dy;
          }
        });
        n.flows[IN].forEach((f) => {
          if (f.isAShadow && !n.isAShadow) {
            f.ty = flows[f.shadowOf].ty;
          } else {
            f.ty = ty;
            ty += f.dy;
          }
        });
      });
    }

    // findNodeGroupOffset(nodeList):
    //   Figure out where these Nodes want to be, and return the
    //   appropriate y-offset value.
    function findNodeGroupOffset(nodeList) {
      // The population of flows to test = the combination of every
      // last flow touching this group of Nodes:
      const fStats = allFlowStats(nodeList),
        totalIn = fStats[IN].value,
        totalOut = fStats[OUT].value;
      // If there are no flows touching *either* side here, there's nothing
      // to offset ourselves relative to, so we can exit early:
      if (totalIn === 0 && totalOut === 0) {
        return 0;
      }

      const nStats = nodeSetStats(nodeList),
        // projectedSourceCenter =
        //   the current Node group's weighted center
        //     MINUS the weighted center of incoming Flows' targets
        //     PLUS the weighted center of incoming Flows' sources.
        // Thought exercise:
        // If 100% of the value of the Node group is flowing in, then this is
        // exactly equivalent to: *the weighted center of all sources*.
        projectedSourceCenter = divide(
          nStats.weight - fStats[IN].targets.weight + fStats[IN].sources.weight,
          nStats.value
        ),
        // projectedTargetCenter = the same idea in the other direction:
        //   current Node group's weighted center
        //     - outgoing weights' center
        //     + final center of those weights
        projectedTargetCenter = divide(
          nStats.weight -
            fStats[OUT].sources.weight +
            fStats[OUT].targets.weight,
          nStats.value
        );

      // Time to do the positioning calculations.
      let goalY = 0;
      if (totalOut === 0) {
        // If we have only in-flows, it's simple:
        // Center the current group relative only to its sources.
        goalY = projectedSourceCenter;
      } else if (totalIn === 0) {
        // Only out-flows? Center this group on its targets:
        goalY = projectedTargetCenter;
      } else {
        // There are flows both in & out. Find the slope between the centers:
        const startStage = fStats[IN].sources.maxSourceStage,
          endStage = fStats[OUT].targets.minTargetStage,
          stageDistance = endStage - startStage,
          slopeBetweenCenters =
            stageDistance !== 0 // Avoid divide-by-0 error
              ? (projectedTargetCenter - projectedSourceCenter) / stageDistance
              : 0;
        // Where along that line should this current group be centered?
        goalY =
          projectedSourceCenter +
          (nStats.stage - startStage) * slopeBetweenCenters;
      }

      // We have a goal Y value! Return the offset from the current center:
      return goalY - nStats.center;
    }

    // updateStageCentering(stage):
    //   Make sure nodes are spaced far enough apart from each other,
    //   AND, after some have been nudged apart, put those
    //   now-locked-together groups of nodes in the best available
    //   position given their group's *overall* connections in & out.
    function updateStageCentering(s) {
      // enforceValidNodePositions():
      //   Make sure this stage doesn't extend past either the top or
      //   bottom, and preserve the required spacing between nodes.
      function enforceValidNodePositions() {
        // Nudge down any nodes which are past the top:
        let yPos = 0; // = the current available y closest to the top
        s.forEach((n) => {
          // If this node's top is above yPos, nudge the node down:
          if (n.y < yPos) {
            n.y = yPos;
          }
          // Set yPos to the next available y toward the bottom:
          yPos = yBottom(n) + actualNodeSpacing;
        });

        // ... if we've gone *past* the bottom, bump nodes back up.
        yPos = size.h; // = the current available y closest to the bottom
        s.slice()
          .reverse()
          .forEach((n) => {
            // if this node's bottom is below yPos, nudge it up:
            if (yBottom(n) > yPos) {
              n.y = yPos - n.dy;
            }
            // Set yPos to the next available y toward the top:
            yPos = n.y - actualNodeSpacing;
          });
      }

      // nodesAreAdjacent: Given two nodes *in height order*, is the top of n2
      // bumping up against n1's bottom edge?
      function nodesAreAdjacent(n1, n2) {
        // Is the bottom of the 1st node + the node spacing essentially
        // the same as the 2nd node's top? (i.e. within a tenth of a 'pixel')
        return n2.y - actualNodeSpacing - yBottom(n1) < 0.1;
      }

      function centerNeighborGroups() {
        // First, Gather groups of neighbors. This loop produces arrays
        // of 1 or more nodes which need to be nudged together.
        const neighborGroups = [];
        s.forEach((n, i) => {
          // Can we include this node as a neighbor of its predecessor?
          if (i > 0 && nodesAreAdjacent(s[i - 1], n)) {
            // Yes? Then append it to the 'current' group:
            const lastGroup = neighborGroups.length - 1;
            neighborGroups[lastGroup].push(n);
          } else {
            // No? Start a new group:
            neighborGroups.push([n]);
          }
        });

        // At this point we *may* have node groups which need nudges.
        // For each multi-node group, find the weighted center of its
        // sources/targets, and place that group's center along that
        // line:
        neighborGroups
          .filter((g) => g.length > 1)
          .forEach((nodeGroup) => {
            // Apply the offset to the entire node group:
            const yOffset = findNodeGroupOffset(nodeGroup);
            nodeGroup.forEach((n) => {
              n.y += yOffset;
            });
          });
      }

      // First, sort this stage's nodes based on either their current
      // positions or on the order they appeared in the data:
      s.sort(autoLayout ? byTopEdges : bySourceOrder);

      // Make sure any overlapping nodes preserve the required spacing.
      // Run the first nudge of all to see what bumps against each other:
      enforceValidNodePositions();

      // Look for sets of neighbors and center them as best we can:
      centerNeighborGroups();
      // Make sure we're still on the canvas:
      enforceValidNodePositions();

      // Since we may have just created more neighbors, iterate 1 more time:
      centerNeighborGroups();
      enforceValidNodePositions();
      // We could keep doing more rounds! But have to stop somewhere.
      // Someday I hope to update this to notice when we've either:
      // 1) stopped bumping into more nodes, or else
      // 2) reached the maximum group (all nodes in 1 neighbor group)
      // For now, this will do.
    }

    // processStages(stageList, factor):
    //   Iterate over a list of stages in the given order, moving Nodes
    //   and Flows around according to the given factor (which proceeds
    //   from 0.99 downwards as the iterations continue).
    function processStages(stageList, factor) {
      stageList.forEach((s) => {
        // Move each node to its ideal vertical position:
        s.forEach((n) => {
          n.y += findNodeGroupOffset([n]) * factor;
        });
        // Update this stage's node positions to incorporate their proximity
        // & required spacing *now*, since they'll be used as the basis for
        // weights in the very next stage:
        updateStageCentering(s);
        // Update the flow sorting too; same reason:
        placeFlowsInsideNodes(s);
      });
      // At the end of each round, do a proper final flow placement
      // across the whole diagram. (Some locally-optimized flow choices
      // don't work across the whole and need this resolution step
      // before doing more balancing).
      placeFlowsInsideNodes(nodes);
    }

    // reCenterDiagram:
    // If (the vertical size of the space occupied by the nodes)
    //  < (the total diagram's Height),
    // then offset ALL Nodes' y positions to center the diagram:
    function reCenterDiagram() {
      const minY = leastY(nodes),
        yH = greatestY(nodes) - minY;
      if (yH < size.h) {
        const yOffset = size.h / 2 - (minY + yH / 2);
        nodes.forEach((n) => {
          n.y += yOffset;
        });
      }
    }

    // Enough preamble. Lay out the nodes:

    initializeNodePositions();
    // Resolve all collisions/spacing & place all flows to start:
    stagesArr.forEach((s) => {
      updateStageCentering(s);
    });
    placeFlowsInsideNodes(nodes);

    let [alpha, counter] = [1, 0];
    while (counter < iterations) {
      counter += 1;
      // Make each round of moves progressively weaker:
      alpha *= 0.99;
      // Run through stages left-to-right, then right-to-left:
      processStages(stagesArr, alpha);
      processStages(stagesArr.slice().reverse(), alpha);
      reCenterDiagram();
    }

    // After the last layout adjustment, remember these node coordinates
    // (for reference when the user is dragging nodes):
    nodes.forEach((n) => {
      n.origPos = { x: n.x, y: n.y };
      n.lastPos = { x: n.x, y: n.y };
      n.move = [0, 0];
    });
  }

  // setup() = define the *skeleton* of the diagram -- which nodes link to
  // which, and in which stages -- but no specific positions yet:
  sankey.setup = () => {
    connectFlowsToNodes();
    computeNodeValues();
    assignNodesToStages();
    updateStagesArray();
    return sankey;
  };

  // layout() = Given a complete skeleton, use the given total width/height and
  // set the exact positions of all nodes and flows:
  sankey.layout = (iterations) => {
    // In case anything's changed since setup, re-generate our map:
    updateStagesArray();
    // Iterate over the structure several times to make the layout nice:
    placeNodes(iterations);
    return sankey;
  };

  // relayout() = Given a complete diagram with some new node positions,
  // calculate where the flows must now start/end:
  sankey.relayout = () => {
    placeFlowsInsideNodes(nodes);
    return sankey;
  };

  return sankey;
};

// Make the linter happy about imported objects:
/* global d3 IN OUT */

document.addEventListener("DOMContentLoaded", function () {
  const tableBody = document.querySelector("#dynamicTable tbody");
  const textarea = document.getElementById("flows_in");

  // Function to sync all 'Generated' column values to the textarea
  function syncGeneratedToTextarea() {
    let flowsText = "";
    const generatedCells = tableBody.querySelectorAll(".generated");

    generatedCells.forEach((cell) => {
      if (cell.textContent.trim()) {
        flowsText += cell.textContent.trim() + "\n";
      }
    });

    textarea.value = flowsText.trim(); // Update the textarea
  }

  // Auto-generate Column D and trigger textarea sync
  function autoGenerate(inputCell) {
    const row = inputCell.parentElement.parentElement; // Get the parent row
    const from = row.querySelector(".from").value;
    const to = row.querySelector(".to").value;
    const amount = row.querySelector(".amount").value;
    const generatedCell = row.querySelector(".generated");

    if (from && to && amount) {
      generatedCell.textContent = `${from} [${amount}] ${to}`;
    } else {
      generatedCell.textContent = ""; // Clear if incomplete
    }

    syncGeneratedToTextarea(); // Sync immediately after auto-generate
  }

  // Trigger auto-generate and sync on input
  tableBody.addEventListener("input", function (e) {
    if (e.target.tagName === "INPUT") {
      autoGenerate(e.target);
    }
  });

  // Ensure the textarea updates after new rows are added
  document.getElementById("addRowBtn").addEventListener("click", function () {
    setTimeout(() => {
      const lastRow = tableBody.lastElementChild;
      if (lastRow) {
        lastRow.querySelectorAll("input").forEach((input) => {
          input.addEventListener("input", () => autoGenerate(input));
        });
      }
    }, 50); // Allow time for row creation
  });
});

function toggleMenu() {
  const menu = document.getElementById("dropdownMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

// Close the menu if clicked outside
window.addEventListener("click", function (e) {
  const menu = document.getElementById("dropdownMenu");
  if (!e.target.matches(".menu-button")) {
    if (menu.style.display === "block") {
      menu.style.display = "none";
    }
  }
});

// Placeholder functions for the menu options
function option1() {
  alert("Option 1 clicked");
}

function option2() {
  alert("Option 2 clicked");
}

function option3() {
  alert("Option 3 clicked");
}

const audio = document.getElementById("welcomeAudio");
const timings = [
  { time: 18, buttonId: "load_example_simple" }, // Play Start Simple at 2 seconds
  { time: 21, buttonId: "load_example_financial_results" }, // Play Financial Results at 5 seconds
  { time: 26, buttonId: "load_example_job_search" }, // Play Job Search at 8 seconds
  { time: 30, buttonId: "load_example_election" }, // Play Ranked Election at 12 seconds
  { time: 34, buttonId: "load_example_journey" }, // Play Journey at 15 seconds
  { time: 40, buttonId: "load_example_basic_budget" }, // Play Budget at 20 seconds
];

let timeouts = []; // Store timeouts to clear them later
let timerRunning = false; // Track if the timer is running

// Function to simulate button click
function simulateButtonClick(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    console.log(`Triggering button: ${buttonId}`);
    button.click(); // Simulates a button click
  } else {
    console.error(`Button with ID ${buttonId} not found.`);
  }
}

// Sync button clicks with audio timings
function syncButtonClicks() {
  timings.forEach(({ time, buttonId }) => {
    const timeoutId = setTimeout(() => {
      simulateButtonClick(buttonId);
    }, time * 1000); // Convert seconds to milliseconds
    timeouts.push(timeoutId); // Store the timeout ID
  });
}

// Reset the sequence (clear timeouts, pause audio, reset time)
function resetSequence() {
  // Clear any active timeouts
  timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  timeouts = []; // Clear timeouts array
  timerRunning = false;

  // Reset audio
  audio.pause();
  audio.currentTime = 0;
}

// Play audio and sync button clicks on hover
const logo = document.getElementById("logo");
logo.addEventListener("mouseenter", () => {
  if (audio.paused) {
    audio.play();
    if (!timerRunning) {
      syncButtonClicks();
      timerRunning = true;
    }
  }
});

// Pause and reset the audio when leaving the logo
logo.addEventListener("mouseleave", () => {
  resetSequence(); // Reset everything when mouse leaves the logo
});

// Replace graph function (example implementation)
function replaceGraph(graphName) {
  console.log(`Graph replaced with: ${graphName}`);
  // Add your graph replacement logic here
}

let selectedElement = null;
let selectedDeleteButton = null;
let selectedDeleteText = null;
let offset = { x: 0, y: 0 };
let logoCount = 0;
let deleteButtonTimeouts = {};

// Update diagram title in real-time
function updateDiagramTopic() {
  let topicInput = document.getElementById("diagram_topic");
  let topic = topicInput.value.trim();
  let svg = document.getElementById("sankey_svg");
  let titleElement = document.getElementById("diagram_title");

  if (!titleElement) {
    titleElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    titleElement.setAttribute("id", "diagram_title");
    titleElement.setAttribute("x", "300");
    titleElement.setAttribute("y", "50");
    titleElement.setAttribute("text-anchor", "middle");
    titleElement.setAttribute("font-size", "24");
    titleElement.setAttribute("font-weight", "bold");
    titleElement.setAttribute("fill", "#000");
    titleElement.setAttribute("style", "cursor: move;");
    titleElement.addEventListener("mousedown", startDrag);
    svg.appendChild(titleElement);
  }

  titleElement.textContent = topic || "Default Topic"; // Update instantly
}

document
  .getElementById("diagram_topic")
  .addEventListener("input", updateDiagramTopic);

// Handle PNG logo upload
function handleLogoUpload(event) {
  let file = event.target.files[0];
  if (file && file.type === "image/png") {
    let reader = new FileReader();
    reader.onload = function (e) {
      let svg = document.getElementById("sankey_svg");
      let logoId = `logo_image_${logoCount}`;

      let logoImage = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "image"
      );
      logoImage.setAttribute("id", logoId);
      logoImage.setAttribute("width", "100");
      logoImage.setAttribute("height", "100");

      let xOffset = 250 + (logoCount % 3) * 120;
      let yOffset = 150 + Math.floor(logoCount / 3) * 120;
      logoImage.setAttribute("x", xOffset);
      logoImage.setAttribute("y", yOffset);
      logoImage.setAttribute("visibility", "visible");
      logoImage.setAttribute("style", "cursor: move;");
      logoImage.setAttribute("href", e.target.result);
      logoImage.addEventListener("mousedown", startDrag);
      svg.appendChild(logoImage);

      // Create delete button
      let deleteButton = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      deleteButton.setAttribute("id", `delete_${logoId}`);
      deleteButton.setAttribute("cx", xOffset + 110);
      deleteButton.setAttribute("cy", yOffset - 10);
      deleteButton.setAttribute("r", "12");
      deleteButton.setAttribute("fill", "#FF4C4C");
      deleteButton.setAttribute("cursor", "pointer");
      deleteButton.setAttribute("visibility", "hidden");

      let deleteText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      deleteText.setAttribute("id", `delete_text_${logoId}`);
      deleteText.setAttribute("x", xOffset + 110);
      deleteText.setAttribute("y", yOffset - 6);
      deleteText.setAttribute("text-anchor", "middle");
      deleteText.setAttribute("fill", "#FFFFFF");
      deleteText.setAttribute("font-size", "18");
      deleteText.setAttribute("font-weight", "bold");
      deleteText.textContent = "×";
      deleteText.setAttribute("visibility", "hidden");

      deleteButton.addEventListener("click", function () {
        svg.removeChild(logoImage);
        svg.removeChild(deleteButton);
        svg.removeChild(deleteText);
        deleteButtonTimeouts[logoId] = null;
      });

      logoImage.addEventListener("mouseover", function () {
        deleteButton.setAttribute("visibility", "visible");
        deleteText.setAttribute("visibility", "visible");
        clearTimeout(deleteButtonTimeouts[logoId]);
      });

      logoImage.addEventListener("mouseout", function () {
        deleteButtonTimeouts[logoId] = setTimeout(() => {
          deleteButton.setAttribute("visibility", "hidden");
          deleteText.setAttribute("visibility", "hidden");
        }, 2000);
      });

      deleteButton.addEventListener("mouseover", function () {
        clearTimeout(deleteButtonTimeouts[logoId]);
        deleteButton.setAttribute("visibility", "visible");
        deleteText.setAttribute("visibility", "visible");
      });

      svg.appendChild(deleteButton);
      svg.appendChild(deleteText);
      logoCount++;
    };
    reader.readAsDataURL(file);
  }
}

// Create guide lines
function createGuideLines() {
  let svg = document.getElementById("sankey_svg");

  let xGuide = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xGuide.setAttribute("id", "x_guide");
  xGuide.setAttribute("stroke", "red");
  xGuide.setAttribute("stroke-dasharray", "5,5");
  xGuide.setAttribute("visibility", "hidden");
  svg.appendChild(xGuide);

  let yGuide = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yGuide.setAttribute("id", "y_guide");
  yGuide.setAttribute("stroke", "red");
  yGuide.setAttribute("stroke-dasharray", "5,5");
  yGuide.setAttribute("visibility", "hidden");
  svg.appendChild(yGuide);
}

// Start dragging
function startDrag(event) {
  if (event.target.id === "diagram_title" || event.target.tagName === "image") {
    if (event.target.tagName === "circle") return;

    selectedElement = event.target;
    let svg = document.getElementById("sankey_svg");

    let point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    let cursor = point.matrixTransform(svg.getScreenCTM().inverse());

    offset.x = cursor.x - parseFloat(selectedElement.getAttribute("x"));
    offset.y = cursor.y - parseFloat(selectedElement.getAttribute("y"));

    if (event.target.tagName === "image") {
      selectedDeleteButton = document.getElementById(
        `delete_${event.target.id}`
      );
      selectedDeleteText = document.getElementById(
        `delete_text_${event.target.id}`
      );
    }

    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", stopDrag);

    updateGuideLines(cursor.x, cursor.y);
    document.getElementById("x_guide").setAttribute("visibility", "visible");
    document.getElementById("y_guide").setAttribute("visibility", "visible");
  }
}

// Dragging action
function drag(event) {
  if (selectedElement) {
    let svg = document.getElementById("sankey_svg");
    let point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    let cursor = point.matrixTransform(svg.getScreenCTM().inverse());

    selectedElement.setAttribute("x", cursor.x - offset.x);
    selectedElement.setAttribute("y", cursor.y - offset.y);

    if (selectedDeleteButton) {
      selectedDeleteButton.setAttribute("cx", cursor.x - offset.x + 110);
      selectedDeleteButton.setAttribute("cy", cursor.y - offset.y - 10);
    }
    if (selectedDeleteText) {
      selectedDeleteText.setAttribute("x", cursor.x - offset.x + 110);
      selectedDeleteText.setAttribute("y", cursor.y - offset.y - 6);
    }

    updateGuideLines(cursor.x - offset.x, cursor.y - offset.y);
  }
}

// Stop dragging
function stopDrag() {
  selectedElement = null;
  selectedDeleteButton = null;
  selectedDeleteText = null;
  document.removeEventListener("mousemove", drag);
  document.removeEventListener("mouseup", stopDrag);

  document.getElementById("x_guide").setAttribute("visibility", "hidden");
  document.getElementById("y_guide").setAttribute("visibility", "hidden");
}

// Initialize guide lines
createGuideLines();

// Toggle logo dropdown visibility
document
  .getElementById("select_logos_btn")
  .addEventListener("click", function (event) {
    let dropdown = document.getElementById("logo_dropdown");

    // Close other dropdowns before opening this one
    document.querySelectorAll(".dropdown-menu").forEach((menu) => {
      if (menu !== dropdown) {
        menu.style.display = "none";
      }
    });

    // Toggle visibility
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";

    // Position dropdown near the button
    let rect = event.target.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
  });

// Hide dropdown if clicked outside
document.addEventListener("click", function (event) {
  let dropdown = document.getElementById("logo_dropdown");
  let button = document.getElementById("select_logos_btn");

  if (!dropdown.contains(event.target) && event.target !== button) {
    dropdown.style.display = "none";
  }
});

// Add predefined logo from dropdown
function addPredefinedLogo(logoSrc) {
  let svg = document.getElementById("sankey_svg");
  let logoId = `logo_image_${logoCount}`;

  let logoImage = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "image"
  );
  logoImage.setAttribute("id", logoId);
  logoImage.setAttribute("width", "100");
  logoImage.setAttribute("height", "100");

  let xOffset = 250 + (logoCount % 3) * 120;
  let yOffset = 150 + Math.floor(logoCount / 3) * 120;
  logoImage.setAttribute("x", xOffset);
  logoImage.setAttribute("y", yOffset);
  logoImage.setAttribute("visibility", "visible");
  logoImage.setAttribute("style", "cursor: move;");
  logoImage.setAttribute("href", logoSrc);
  logoImage.addEventListener("mousedown", startDrag);
  svg.appendChild(logoImage);

  // Create delete button
  let deleteButton = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  deleteButton.setAttribute("id", `delete_${logoId}`);
  deleteButton.setAttribute("cx", xOffset + 110);
  deleteButton.setAttribute("cy", yOffset - 10);
  deleteButton.setAttribute("r", "12");
  deleteButton.setAttribute("fill", "#FF4C4C");
  deleteButton.setAttribute("cursor", "pointer");
  deleteButton.setAttribute("visibility", "hidden");

  let deleteText = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text"
  );
  deleteText.setAttribute("id", `delete_text_${logoId}`);
  deleteText.setAttribute("x", xOffset + 110);
  deleteText.setAttribute("y", yOffset - 6);
  deleteText.setAttribute("text-anchor", "middle");
  deleteText.setAttribute("fill", "#FFFFFF");
  deleteText.setAttribute("font-size", "18");
  deleteText.setAttribute("font-weight", "bold");
  deleteText.textContent = "×";
  deleteText.setAttribute("visibility", "hidden");

  deleteButton.addEventListener("click", function () {
    svg.removeChild(logoImage);
    svg.removeChild(deleteButton);
    svg.removeChild(deleteText);
    deleteButtonTimeouts[logoId] = null;
  });

  logoImage.addEventListener("mouseover", function () {
    deleteButton.setAttribute("visibility", "visible");
    deleteText.setAttribute("visibility", "visible");
    clearTimeout(deleteButtonTimeouts[logoId]);
  });

  logoImage.addEventListener("mouseout", function () {
    deleteButtonTimeouts[logoId] = setTimeout(() => {
      deleteButton.setAttribute("visibility", "hidden");
      deleteText.setAttribute("visibility", "hidden");
    }, 2000);
  });

  deleteButton.addEventListener("mouseover", function () {
    clearTimeout(deleteButtonTimeouts[logoId]);
    deleteButton.setAttribute("visibility", "visible");
    deleteText.setAttribute("visibility", "visible");
  });

  svg.appendChild(deleteButton);
  svg.appendChild(deleteText);
  logoCount++;
}
// Convert image URL to Base64 and call the existing function
async function addPredefinedLogoWithBase64(logoSrc) {
  let base64Image = await convertImageToBase64(logoSrc);
  if (base64Image) {
    addPredefinedLogo(base64Image); // Call existing function with Base64
  } else {
    console.error("Failed to convert image to Base64");
  }
}

// Convert image URL to Base64
async function convertImageToBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error converting image to Base64:", error);
  }
}
