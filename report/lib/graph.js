"use strict";

function startGraph(mavData) {

    // Node and link data from the JSON file
    var allNodes = mavData.nodes,
        allLinks = mavData.links;

    var flattenedNodes = {},    // all nodes included in graph
        flattenedLinks = {},    // all links included in graph   
        nodeMap        = {},    // all nodes from JSON file (including duplicate LSUs)
        linkMap        = {},    // all links to nodes
        invisNodes     = [],    // nodes which disappear from layer deselected (eg. control, memory)
        invisLinks     = [];    // links which disappear when layer deselected

    var clickDown;              // node which was last clicked

    var nodeTypes = [];

    var chanWidth        = 5,
        nodeHeight       = 5,
        nodeWidth        = 20,
        containerPadding = 15;

    var memsysNodes = [];

    var spg, spgSVG, spgGroup;

    // Add all 3 graphs
    addGraph();

    // Create maps of nodes and links
    createNodeMap(allNodes);
    createLinkMap(allLinks);

    // Collapse similar channels
    preProcessChannels();
    preProcessMemory(memsysNodes);

    // Create separation container
    spg.setNode("container", {});

    // Create nodes and links
    createNodes("", allNodes);
    createLinks(allLinks);
    linkMemory(memsysNodes);

    // Create the renderer
    var spgRenderer = new dagreD3.render();

    // Render the graph
    spgRenderer(d3.select("#spg g"), spg);
    
    // Setup the stall point graph
    setupSPG();

    // Detail Table

    var detailTable = function (n) {
        var details = [];
        details.push({ first: "<b>" + flattenedNodes[n].name + " Info" + "</b>", second: "" });
        if (flattenedNodes[n].details) {
            Object.keys(flattenedNodes[n].details).forEach(function (k) {
                details.push({ first: k, second: flattenedNodes[n].details[k] });
            });
        }
        if (flattenedNodes[n].II) {
            details.push({ first: "II", second: flattenedNodes[n].II });
            details.push({ first: "Additional Info", second: flattenedNodes[n].LoopInfo });
        }

        if (flattenedNodes[n].pumping && flattenedNodes[n].pumping == 1) {
            details.push({ first: "Additional Info: ", second: "Single pumped" });
        } else if (flattenedNodes[n].pumping && flattenedNodes[n].pumping == 2) {
            details.push({ first: "Additional Info: ", second: "Double pumped" });
        }
        return details;
    }

    // FUNCTIONS
    // --------------------------------------------------------------------------------------------

    // Print nodes and links to console
    function printNodesAndLinks() {
        
        console.log("NODES");
        Object.keys(flattenedNodes).forEach(function (key) {
            console.log(key);
        });

        console.log("LINKS");
        Object.keys(flattenedLinks).forEach(function (key) {
            console.log(key, flattenedLinks[key]);
        });
    }

    // Create graphs for tabs
    function addGraph() {

        // Add graph canvas
        d3.select("#SPG")
            .append("svg")
            .attr("id", "spg")
            .attr("width", 2000);

        // Add layers menu
        d3.select("#SPG")
            .append("div")
            .attr("class", "layers");

        // Create the input graph
        spg = new dagreD3.graphlib.Graph({ compound: true })
          .setGraph({ nodesep: 25, ranksep: 35, edgesep: 15 })         // nodesep: horizontal distance between nodes
                                                                       // ranksep: vertical distance between nodes
                                                                       // edgesep: padding between container and nodes
          .setDefaultEdgeLabel(function () { return {}; });

        // Create svg group
        spgSVG  = d3.select("#spg")
        spgGroup = spgSVG.append("g")
            .attr('class', 'graph');

    }

    // Create map of all nodes: node id -> node data
    function createNodeMap(nodes) {
        nodes.forEach(function (n) {
            nodeMap[String(n.id)] = n;
            if (n.type == "memsys") memsysNodes.push(n);
            if (n.children) createNodeMap(n.children);
        });
    }

    // Create map of all links: node id -> all links associated with node
    function createLinkMap(links) {
        links.forEach(function (lnk) {
            if (!linkMap[String(lnk.from)]) linkMap[String(lnk.from)] = [];
            linkMap[String(lnk.from)].push(lnk);

            if (!linkMap[String(lnk.to)]) linkMap[String(lnk.to)] = [];
            linkMap[String(lnk.to)].push(lnk);
        });
    }

    // Collapse similar channels
    function preProcessChannels() {
        var channels = [],
            rLink,
            wLink,
            read = {},
            write = {},
            found = false;

        Object.keys(nodeMap).forEach(function (key) {
            if (nodeMap[key].type == "channel" || nodeMap[key].type == "stream") {
                read = {};
                write = {};
                rLink = {};
                wLink = {};

                if (linkMap[String(nodeMap[key].id)].length < 2) {
                    nodeMap[key].visible = true;
                    return;
                }

                if (linkMap[String(nodeMap[key].id)][0].from == nodeMap[key].id) {
                    read = linkMap[String(nodeMap[key].id)][0].to;
                    rLink = linkMap[String(nodeMap[key].id)][0];
                    write  = linkMap[String(nodeMap[key].id)][1].from;
                    wLink = linkMap[String(nodeMap[key].id)][1];
                } else {
                    write  = linkMap[String(nodeMap[key].id)][0].from;
                    wLink = linkMap[String(nodeMap[key].id)][0];
                    read = linkMap[String(nodeMap[key].id)][1].to;
                    rLink = linkMap[String(nodeMap[key].id)][1];
                }

                nodeMap[key]['read'] = read;
                nodeMap[key]['write'] = write;
                nodeMap[key]['count'] = 1;
                found = false;

                for (var i = 0; i < channels.length; i++) {
                    if (   channels[i].name       == nodeMap[key].name
                        && channels[i].read.line  == read.line
                        && channels[i].read.file  == read.file
                        && channels[i].write.line == write.line
                        && channels[i].write.file == write.file) {
                        channels[i].count++;
                        nodeMap[key].visible = false;
                        rLink.from = channels[i].id;
                        wLink.to = channels[i].id;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    nodeMap[key].visible = true;
                    channels.push(nodeMap[key]);
                }
	    }
        });
    }
    function preProcessMemory(nodes) {
        nodes.forEach(function(n) {
            n.children.forEach(function(child) {
                child.parent = String(n.id);
            });
        });
    }

    // Link nodes to memsys node in stall point graph - JSON data has links to banks, but graph only shows memory systems and variables
    // so the links need to be inferred
    function linkMemory(nodes) {

        nodes.forEach(function (n) {
            var links = [];
            var newLink = {};

            n.children.forEach(function (bank) {
                if (linkMap[String(bank.id)]) {
                    linkMap[String(bank.id)].forEach(function (link) {
                        if (link.from == bank.id) {
                            if (!flattenedNodes[link.to]) return;
                            for (var i = 0; i < links.length; i++) {
                                if (links[i].to == link.to) return;
                            }
                            newLink = { from: n.id, to: link.to };
                            spg.setEdge(String(n.id), String(link.to), { lineInterpolate: "basis" });
                            if (!flattenedLinks[String(link.to)]) flattenedLinks[String(link.to)] = [];
                            flattenedLinks[String(link.to)].push(newLink);
                        } else {
                            if (!flattenedNodes[link.from]) return;
                            for (var i = 0; i < links.length; i++) {
                                if (links[i].from == link.from) return;
                            }
                            newLink = { from: link.from, to: n.id };
                            spg.setEdge(String(link.from), String(n.id), { arrowhead: "normal", lineInterpolate: "basis", weight: 1 });
                            if (!flattenedLinks[String(link.from)]) flattenedLinks[String(link.from)] = [];
                            flattenedLinks[String(link.from)].push(newLink);
                        }

                        links.push(newLink);
                        if (!flattenedLinks[String(n.id)]) flattenedLinks[String(n.id)] = [];
                        flattenedLinks[String(n.id)].push(newLink);
                    });
                }
            });
        });
    }

    // Get abbreviated name for instructions
    function getLabelName(name) {
        if (name.indexOf("Load") != -1) return "LD";
        else if (name.indexOf("Store") != -1) return "ST";
        else if (name.indexOf("Read") != -1) return "RD";
        else if (name.indexOf("Write") != -1) return "WR";
        else return (name);
    }


    // Add highlighting persistence and syncing to editor and details pane
    function addClickFunctions(graph) {

        var nodes = graph.selectAll("g.node rect, g.nodes .label, g.node circle, g.node polygon")
            .on('click', function (d) {

                refreshPersistence(graph);
                if (clickDown == d) {
                    clickDown = null;
                } else {
                    highlightNodes(d, graph);
                    changeDivContent(VIEWS.SPV, 0, detailTable(d));
                    clickDown = d;
                }

                // details and editor syncing (reset if no line number)
                if (flattenedNodes[d].hasOwnProperty('file') && flattenedNodes[d].file != "" && flattenedNodes[d].file != "0") syncEditorPaneToLine(flattenedNodes[d].line, findFile(flattenedNodes[d].file));
                else syncEditorPaneToLine(1, curFile);
            });
    }

    // Find filename given file index (used for syncing nodes to editor)
    function findFile(index) {
        var filename = "";

        Object.keys(mavData.fileIndexMap).forEach(function (fi) {
            if (mavData.fileIndexMap[fi] == index) filename = getFilename(fi);
        });
        return filename;
    }

    // Add highlighing to nodes and links
    function addHighlighting(graph) {

        var highlightColor = "#1d99c1";

        var clusterHighlights = graph.selectAll("g.cluster rect")
            .on('mouseover', function (d) {
                if (!clickDown && flattenedNodes[d] && (flattenedNodes[d].details || flattenedNodes[d].II)) {
                    changeDivContent(VIEWS.SPV, 0, detailTable(d));
                }
            });

        var nodeHighlights = graph.selectAll("g.node rect, g.label, g.node circle, g.node polygon")
            .on('mouseover', function (d) {
                highlightNodes(d, graph);
                if (!clickDown && flattenedNodes[d] && (flattenedNodes[d].details || flattenedNodes[d].type == "memsys")) {
                    changeDivContent(VIEWS.SPV, 0, detailTable(d));
                }
            })
            .on('mouseout', function (d) {
                if (clickDown != d) {
                    refreshPersistence(graph);
                    highlightNodes(clickDown, graph);
                }

            });


        // Highlight link, associated nodes on mouseover
        var linkHighlights = graph.selectAll("g.edgePath path")
            .on('mouseover', function (d) {

                var connections = graph.selectAll("g.edgePath")
                    .filter(function (k) {
                        return d.v == k.v && d.w == k.w;
                    });

                connections.selectAll("path")
                    .style("opacity", 1)
                    .style("stroke-width", 5)
                    .style("stroke", highlightColor);

                var connectedNodes = graph.selectAll("g.node rect, g.node circle, g.node polygon")
                    .filter(function (n) {
                        return n == d.v || n == d.w;
                    })
                    .style("stroke-width", 3)
                    .style("stroke", highlightColor);

                connections.selectAll("marker")
                    .attr({
                        "markerUnits": "userSpaceOnUse",
                        "preserveAspectRatio": "none",
                        "viewBox": "0 0 40 10",
                        "refX": 6,
                        "markerWidth": 40,
                        "markerHeight": 12
                    })
                    .style("stroke-width", 0);
                connections.selectAll("marker path")
                    .attr("style", "fill:" + highlightColor + "; opacity: 1; stroke-width:0");

            })
            .on('mouseout', function (d) {
                if (clickDown != d) refreshPersistence(graph);
                if (clickDown) highlightNodes(clickDown, graph);
            });
    }

    // Highlight associated links and nodes
    function highlightNodes(d, graph) {

        var highlightColor = "#1D99C1";

        var associatedNodes = [];
        associatedNodes.push(d);

        // Find associated links and nodes
        var connections = graph.selectAll("g.edgePath").filter(function (k) {
            if (invisNodes.indexOf(k.v) != -1 || invisNodes.indexOf(k.w) != -1) return false;
            if (invisLinks.indexOf(k) != -1) return false;
            //if (!filterLayoutLinks(k)) {
                if (k.v == d || k.w == d) {
                    if (associatedNodes.indexOf(k.v) == -1) associatedNodes.push(k.v);
                    if (associatedNodes.indexOf(k.w) == -1) associatedNodes.push(k.w);
                    return true;
                }
            //}
            return false;
        });

        // Highlight links
        connections.selectAll("path")
            .attr("style", "stroke:" + highlightColor + "; opacity: 1; fill:none; stroke-width:5;");

        // Highlight nodes
        var connectedNodes = graph.selectAll("g.node rect, g.node circle, g.node polygon")
            .filter(function (n) {
                if (associatedNodes.indexOf(n) == -1) return false;
                else return true;
            })
            .style("stroke-width", 3)
            .style("stroke", highlightColor);

        // Color and highlight arrowheads
        connections.selectAll("marker")
            .attr({
                "markerUnits": "userSpaceOnUse",
                "preserveAspectRatio": "none",
                "viewBox": "0 0 40 10",
                "refX": 6,
                "markerWidth": 40,
                "markerHeight": 12
            })
        .style("stroke-width", 0);
        connections.selectAll("marker path")
            .attr("style", "fill:" + highlightColor + "; opacity: 1; stroke-width:0");
    }

    // Add tooltips to display details
    function addToolTips(graph) {
        var tt = function (n) {
            var name = "";
            if (flattenedNodes[n].type == "channel" || flattenedNodes[n].type == "stream") name += flattenedNodes[n].type + " ";
            
            name += flattenedNodes[n].name;

            if (flattenedNodes[n].count && flattenedNodes[n].count > 1) name += " (x" + flattenedNodes[n].count + ")";

            var text = "<p class='name'>" + name + " Info</p><p class='description'>";
            Object.keys(flattenedNodes[n].details).forEach(function (k) {
                text += k + ": " + flattenedNodes[n].details[k] + "<br>";
            });
            text += "</p>";
            return text;
        }

        graph.selectAll("g.node rect, g.cluster rect, g.node circle, g.node polygon")
            .filter(function (d) {
                if (d.indexOf("container") != -1 || d == "glbmem") return false;
                return (flattenedNodes[d] && flattenedNodes[d].details);
            })
            .style("fill", "white")
            .attr("title", function (d) { return tt(d); })
            .each(function (v) { $(this).tipsy({ gravity: "s", opacity: 1, html: true }); });
    }

    // Return true if node is merge or branch
    function isMergeOrBranch(node) {
        return (flattenedNodes[node].name == "loop" || flattenedNodes[node].name == "begin" || flattenedNodes[node].name == "end" || flattenedNodes[node].name == "loop end");
    }

    this.refreshGraph = function () {
        clickDown = null;
        refreshPersistence(spgSVG);
    }

    // Refresh persistent highlighting
    function refreshPersistence(graph) {

        graph.selectAll("g.edgePath path")
            .style("opacity", 0.3)
            .style("stroke-width", 2)
            .style("stroke", "#333");

        graph.selectAll("g.node rect, g.node circle, g.node polygon")
            .style("stroke-width", 1.5)
            .style("stroke", "#999");

        colorArrowheads(graph);
        if (graph == spgSVG)
            colorNodes(graph);
    }

    // Format arrowheads
    function colorArrowheads(graph) {
        var markers = graph.selectAll("marker")
            .attr({
                "markerUnits": "userSpaceOnUse",
                "preserveAspectRatio": "none",
                "viewBox": "0 0 40 10",
                "refX": 8,
                "markerWidth": 30,
                "markerHeight": 8
            })
            .style("stroke-width", 0);
        graph.selectAll("marker path")
            .attr("style", "fill:#333; opacity: 1; stroke-width:0");
    }

    // Color basic blocks with loops that cannot be unrolled
    function colorNodes(graph) {
        var loopBlockColor   = "#ff0000",
            singlePumpColor  = "#5cd6d6",
            doublePumpColor  = "#239090",
            glbmemColor      = "#006699",
            loopEdgeColor    = "#000099",
            mergeBranchColor = "#ff8533",
            channelColor     = "#bf00ff",
            kernelColor      = "#666699";

        // Fill all clusters (necessary for mouseover)
        var nodes = graph.selectAll("g.node rect, g.cluster rect")
            .filter(function (d) {
                return (d.indexOf("container") == -1 && d != "glbmem" && flattenedNodes[d]
                    && flattenedNodes[d].type != "kernel" && flattenedNodes[d].type != "component");
            })
            .style("fill-opacity", 0.5)
            .style("fill", "white");

        // Color loop basic blocks
        nodes.filter(function (d) {
            var node = flattenedNodes[d];
            return (node && node.type == "bb" && node.hasSubloops == "No"
                && (node.isPipelined == "No"
                || node.II > 1
                || (node.II == 1 && node.hasFmaxBottlenecks == "Yes")));
        })
            .style("fill-opacity", 0.5)
            .style("fill", loopBlockColor)
            .style("stroke-width", 0);

        // Color kernel outlines
        graph.selectAll("g.node rect, g.cluster rect")
            .filter(function (d) {
                return (flattenedNodes[d] && (flattenedNodes[d].type == "kernel" || flattenedNodes[d].type == "component"));
            })
            .style("stroke-width", 2)
            .style("stroke", kernelColor);

        // Select all memsys nodes
        var mem = nodes.filter(function (d) {
            return (flattenedNodes[d] && flattenedNodes[d].type == "memsys");
        });

        // Color singlepumped local memory
        mem.filter(function (d) {
                return (flattenedNodes[d].pumping == 1);
            })
            .style("fill", singlePumpColor)
            .style("stroke", singlePumpColor);

        // Color doublepumped local memory
        mem.filter(function (d) {
                return (flattenedNodes[d].pumping == 2);
            })
            .style("fill", doublePumpColor)
            .style("stroke", doublePumpColor);

        // Color global memory systems
        mem.filter(function (d) {
                return (flattenedNodes[d] && flattenedNodes[d].global);
            })
            .style("fill", glbmemColor)
            .style("stroke", glbmemColor);

        var insts = graph.selectAll("g.nodes circle, g.nodes polygon");

        // Color stallable nodes
        insts.filter(function (d) {
                var details = flattenedNodes[d].details;
                return (details
                    && details['Stall-free']
                    && details['Stall-free'] == "No");
             })
            .style("stroke", loopBlockColor)
            .style("fill", loopBlockColor);

        insts.filter(function (d) {
                for (var i = 0; i < flattenedLinks[d].length; i++) {
                    var parentFrom = flattenedNodes[flattenedLinks[d][i].from];
                    var parentTo = flattenedNodes[flattenedLinks[d][i].to];
                    if (parentFrom.global || parentTo.global) return true;
                }
                return false;
            })
            .style("fill-opacity", 0.5)
            .style("stroke", glbmemColor)
            .style("fill", glbmemColor);

        var connections = graph.selectAll("g.edgePath");

        // Color channel connections
        var channelConnections = connections.filter(function (k) {
            return (flattenedNodes[k.v].type == "channel"
                || flattenedNodes[k.v].type == "stream"
                || flattenedNodes[k.w].type == "channel"
                || flattenedNodes[k.w].type == "stream");
        });

        channelConnections.selectAll("path")
            .style("stroke", channelColor);

        channelConnections.selectAll("marker")
            .attr({
                "markerUnits": "userSpaceOnUse",
                "preserveAspectRatio": "none",
                "viewBox": "0 0 40 10",
                "refX": 6,
                "markerWidth": 40,
                "markerHeight": 12
            })
            .style("stroke-width", 0);
        channelConnections.selectAll("marker path")
            .attr("style", "fill:" + channelColor + "; opacity: 0.8; stroke-width:0");

        // Color loop connections
        var mergeBranchConnections = connections.filter(function (k) {
            if ((isMergeOrBranch(k.v) || flattenedNodes[k.v].type == "bb")
                && flattenedNodes[k.w].loopTo
                && (isMergeOrBranch(k.w) || flattenedNodes[k.w].type == "bb")
                && flattenedNodes[k.w].loopTo == flattenedNodes[k.v].id) {
                return true;
            }
            return false;
        });

        // Color MG and BR in loops
        insts.filter(function (d) {
            var node = flattenedNodes[d];
            var bb = flattenedNodes[node.parent];
            if (node && isMergeOrBranch(d) && bb.hasSubloops == "No"
                    && (bb.isPipelined == "No"
                    ||  bb.II > 1
                    || (bb.II == 1 && bb.hasFmaxBottlenecks == "Yes"))) {
                flattenedNodes[d].isHighlighted = true;
                return true;
            }
            flattenedNodes[d].isHighlighted = false;
            return false;
        })
        .style("stroke", mergeBranchColor)
        .style("fill", mergeBranchColor);

        // Color loop back edges
        mergeBranchConnections.selectAll("path")
            .style("opacity", 0.5)
            .style("stroke", loopEdgeColor);

        // Color highlighted loop back edges
        var loopHighlight = mergeBranchConnections.filter(function (k) {
            return (flattenedNodes[k.v].isHighlighted && flattenedNodes[k.w].isHighlighted);
            });
        loopHighlight.selectAll("path")
            .style("stroke", loopBlockColor);

        // Color loop back edge arrowheads
        mergeBranchConnections.selectAll("marker")
        .style("stroke-width", 0);

        mergeBranchConnections.selectAll("marker path")
            .style("fill", loopEdgeColor)
            .style("stroke-width", 0)
            .style("opacity", 0.8);

        loopHighlight.selectAll("marker path")
            .style("fill", loopBlockColor)
            .style("stroke-width", 0)
            .style("opacity", 0.8);

    }

    // STALL POINT GRAPH
    // --------------------------------------------------------------------------------------------

    // Setup the stall point viewer features
    function setupSPG() {

        var offsetX = 20;
        var offsetY = 20;

        // Add layers menu
        addCheckBox();
        // Add highlighting for links
        addHighlighting(spgSVG);
        // Add syncing to line and persistence for link highlights
        addClickFunctions(spgSVG);
        // Color link arrowheads
        colorArrowheads(spgSVG);
        // Add tooltips to nodes to display details
        addToolTips(spgSVG);
        // Color basic blocks with loops
        colorNodes(spgSVG);
        // Hide container border
        spgSVG.selectAll("g.cluster rect")
            .filter(function (d) { return d.indexOf("container") != -1 || d == "glbmem" })
            .style("stroke-width", "0px");

        var panelWidth = $('#SPG')[0].getBoundingClientRect().width;
        var panelHeight = $('#SPG')[0].getBoundingClientRect().height;

        var graphWidth = $('g.graph')[0].getBoundingClientRect().width + 2*offsetX;
        var graphHeight = $('g.graph')[0].getBoundingClientRect().height + 2*offsetY;
        var scale = Math.max(panelWidth/graphWidth, panelHeight/graphHeight);

        // Add zoom and drag
        var zoom = d3.behavior.zoom().on("zoom", function () {
            var x = d3.event.translate[0] + offsetX;
            var y = d3.event.translate[1] + offsetY;
            d3.select("#spg").select("g")
                .attr("transform", "translate(" + x + "," + y + ")" +
                                        "scale(" + d3.event.scale*scale + ")");
            $('g.cluster rect, g.node circle, g.node rect, g.node polygon').trigger('mouseleave');
        });

        spgSVG.call(zoom);

        // Place the graph in top left corner
        spgGroup.attr("transform", "translate( " + offsetX + ", " + offsetY + ") scale(" + scale + ")");
        spgSVG.attr("height", Math.max(spg.graph().height + 40, panelHeight));

    }

    // Create nodes for stall point
    function createNodes(group, nodes) {
        var isInst = false;
        var insts = [];
        var index = 0;
        var name = "";

        nodes.forEach(function (n) {

            if (n.type != "inst") flattenedNodes[String(n.id)] = n;

            if (group != "") n.parent = group;

            if (nodeTypes.indexOf(n.type) == -1) nodeTypes.push(n.type);

            if (n.children) {

                // Set node
                if (n.type == "kernel" || n.type == "component") {
                    spg.setNode(String(n.id), { label: n.type + " " + n.name, clusterLabelPos: "top", paddingTop: containerPadding });
                } else if (n.type == "memsys") {
                    if (flattenedNodes[String(group)].name == "Global Memory") n.global = true; 
                    name = n.name + " [" + n.banks + "]";
                    if (n.replFactor > 1) name += " (x" + n.replFactor + ")";
                    spg.setNode(String(n.id), { label: name, clusterLabelPos: "top", paddingTop: containerPadding });
                } else {
                    spg.setNode(String(n.id), { label: n.name, clusterLabelPos: "top", paddingTop: containerPadding });
                }

                // Place in correct group
                if (n.name == "Global Memory") {
                    spg.setNode("glbmem", {});
                    spg.setParent(String(n.id), "glbmem");
                } else if (group != "") {
                    spg.setParent(String(n.id), group);
                } else {
                    spg.setParent(String(n.id), "container");
                }

                // Create nodes from children, unless memsys (banks are hidden)
                if (n.type != "memsys") createNodes(String(n.id), n.children);

            } else {

                // Create regular node, inst, or channel
                if (n.type == "inst") {
                    index = checkInst(insts, n, true);
                    if (index == -1) {
                        n.count = 1;
                        insts.push(n);
                    } else {
                        insts[index].count += 1;
                    }
                    isInst = true;
                } else if (n.type == "channel" || n.type == "stream") {
                    if (n.visible) {
                        name = n.name.substring(0, 2);
                        if (n.name.length > 2) name += "...";
                        if (n.count > 1) name += " (x" + n.count + ")";
                        spg.setNode(String(n.id), { label: name, width: chanWidth, height: nodeHeight });
                        spg.setParent(String(n.id), "container");
                    }
                } else {
                    spg.setNode(String(n.id), { label: n.name, width: nodeWidth, height: nodeHeight });

                    if (n.name == "Global Memory") {
                        spg.setNode("glbmem", {});
                        spg.setParent(String(n.id), "glbmem");
                    } else if (group != "") {
                        spg.setParent(String(n.id), group);
                    } else {
                        spg.setParent(String(n.id), "container");
                    }
                }
            }

        });

        if (isInst) setInsts(group, insts);
    }

    // Create links for stall point
    function createLinks(links) {
        links.forEach(function (lnk) {
            if (flattenedNodes.hasOwnProperty(String(lnk.from)) && flattenedNodes.hasOwnProperty(String(lnk.to))) {

                if (!flattenedLinks[String(lnk.from)]) flattenedLinks[String(lnk.from)] = [];
                flattenedLinks[String(lnk.from)].push(lnk);

                if (!flattenedLinks[String(lnk.to)]) flattenedLinks[String(lnk.to)] = [];
                flattenedLinks[String(lnk.to)].push(lnk);

                spg.setEdge(String(lnk.from), String(lnk.to), { arrowhead: "normal", lineInterpolate: "basis", weight: 1 });
            }
        });
    }

     // Check if two insts are the same
    function checkInst(insts, node, isSPG) {
        var index = 0;
        for (var i = 0; i < insts.length; i++) {
            if (   node.type == "inst"
                && node.name == insts[i].name
                && node.line == insts[i].line
                && node.file == insts[i].file
                && verifyLinks(insts[i], node, isSPG)) { return index; }
            index++;
        }

        return -1;
    }

    // Verify that links are the same between duplicates
    function verifyLinks(inst, node, isSPG) {
        var instLinks = linkMap[String(inst.id)];
        var nodeLinks = linkMap[String(node.id)];
        var found = false;

        for (var j = 0; j < instLinks.length; j++) {
            found = false;
            if (instLinks[j].from == inst.id) {
                for (var i = 0; i < nodeLinks.length; i++) {
                    if (    nodeLinks[i].from == node.id
                        && (nodeLinks[i].to == instLinks[j].to
                        || (isSameLoadStoreTarget(nodeLinks[i].to, instLinks[j].to) && isSPG)) 
                        && nodeLinks[i].from == node.id) {
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            } else if (instLinks[j].to == inst.id) {
                for (var i = 0; i < nodeLinks.length; i++) {
                    if ( (  nodeLinks[i].from == instLinks[j].from 
                        || (isSameLoadStoreTarget(nodeLinks[i].from, instLinks[j].from) && isSPG)) 
                        && nodeLinks[i].to == node.id) {
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            }
        }

        return true;
    }

    function isSameLoadStoreTarget(node1, node2) {
        return(nodeMap[node1].type == "bank" && nodeMap[node2].type == "bank" && nodeMap[node1].parent == nodeMap[node2].parent);
    }

    // Set insts - including duplicates
    function setInsts(group, insts) {
        var name;

        insts.forEach(function (n) {
            flattenedNodes[String(n.id)] = n;

            name = getLabelName(n.name);
            if (n.hasOwnProperty('count') && n.count > 1) name += " (x" + n.count + ")";

            if (flattenedNodes[String(n.id)].name == "end" || flattenedNodes[String(n.id)].name == "loop end") spg.setNode(String(n.id), { label: name, shape: "diamond", width: 1, height: 1 });
            else spg.setNode(String(n.id), { label: name, shape: "circle", width: 1, height: 1 });

            if (group != "") spg.setParent(String(n.id), group);
            else spg.setParent(String(n.id), "container");
        });
    }

    // Insert html for layer menu
    function addCheckBox() {
        var menu = "";
        menu += "<form id='layerMenu'>";

        menu += "<button title=\"Remove highlights\" type='button' onclick='spv_graph.removeHighlights()' style=\"padding:0\">Clear Selection</button>&nbsp&nbsp&nbsp&nbsp";
        nodeTypes.forEach(function (nt) {
            switch (nt) {
                case "inst": menu += "<input id='linkCheck' type='checkbox' checked='checked' name='linkType' value='" + nt + "' onClick='spv_graph.resetVisibleLinks()'>&nbspControl&nbsp&nbsp";
                    break;
                case "memsys": menu += "<input id='linkCheck' type='checkbox' checked='checked' name='linkType' value='" + nt + "' onClick='spv_graph.resetVisibleLinks()'>&nbspMemory&nbsp&nbsp";
                    break;
                case "channel": menu += "<input id='linkCheck' type='checkbox' checked='checked' name='linkType' value='" + nt + "' onClick='spv_graph.resetVisibleLinks()'>&nbspChannels&nbsp&nbsp";
                    break;
                case "stream": menu += "<input id='linkCheck' type='checkbox' checked='checked' name='linkType' value='" + nt + "' onClick='spv_graph.resetVisibleLinks()'>&nbspStreams&nbsp&nbsp";
                    break;
            }
        });

        menu += "</form>";

        $(".layers").html(menu);
    }

    // Reset visibility on links after checked and unchecked in layers menu
    this.resetVisibleLinks = function () {

        d3.selectAll("g.edgePath path").style("visibility", "visible");
        d3.selectAll("g.node rect, g.label").style("visibility", "visible");
        refreshPersistence(spgSVG);
        clickDown = null;
        invisNodes = [];
        invisLinks = [];

        $('#layerMenu input').each(function () {
            var tempBox = (this);

            if (!tempBox.checked) {
                switch (tempBox.getAttribute("value")) {

                    // Remove streams and links to channels
                    case "stream":
                        spgSVG.selectAll("g.edgePath path").filter(function (k) {
                                if (flattenedNodes[k.v].type == "stream" || flattenedNodes[k.w].type == "stream") {
                                    invisLinks.push(k);
                                    return true;
                                }
                                return false;
                            })
                            .style("visibility", "hidden");

                        spgSVG.selectAll("g.node rect, g.nodes .label").filter(function (n) {
                                if (flattenedNodes[n].type == "stream") {
                                    if (invisNodes.indexOf(n) == -1) invisNodes.push(n);
                                    return true;
                                }
                                return false;
                            })
                            .style("visibility", "hidden");
                        break;

                    // Remove channels and links to channels
                    case "channel":
                        spgSVG.selectAll("g.edgePath path").filter(function (k) {
                                if (flattenedNodes[k.v].type == "channel" || flattenedNodes[k.w].type == "channel") {
                                    invisLinks.push(k);
                                    return true;
                                }
                                return false;
                            })
                            .style("visibility", "hidden");

                        spgSVG.selectAll("g.node rect, g.nodes .label").filter(function (n) {
                                if (flattenedNodes[n].type == "channel") {
                                    if (invisNodes.indexOf(n) == -1) invisNodes.push(n);
                                    return true;
                                }
                                return false;
                            })
                            .style("visibility", "hidden");
                        break;

                        // Remove links between instructions
                    case "inst":
                        spgSVG.selectAll("g.edgePath path").filter(function (k) {
                                if (flattenedNodes[k.v].type == "inst" && flattenedNodes[k.w].type == "inst") {
                                    invisLinks.push(k);
                                    return true;
                                }
                                return false;
                            })  
                            .style("visibility", "hidden");
                        break;

                        // Remove all links to and from memory
                    case "memsys":
                        spgSVG.selectAll("g.edgePath path").filter(function (k) {
                                if (flattenedNodes[k.v].type == "memsys" || flattenedNodes[k.w].type == "memsys") {
                                    invisLinks.push(k);
                                    return true;
                                }
                                return false;
                            })
                            .style("visibility", "hidden");
                        break;
                }
            }

        });
    }

    // Force link viewer to remain in top right corner
    this.stickLinkViewer = function () {
        var graph = document.getElementById("SPG").getBoundingClientRect();

        // Place the link viewer in top right of SP viewer
        // Scrollbar is 17px wide
        $(".layers").css("left", graph.right - $(".layers").outerWidth() + $('#SPG')[0].clientWidth - $('#SPG')[0].offsetWidth);
        $(".layers").css("top", graph.top);
    }

    // Remove highlighting
    this.removeHighlights = function () {
        refreshPersistence(spgSVG);
        clickDown = null;
    }
    
}



