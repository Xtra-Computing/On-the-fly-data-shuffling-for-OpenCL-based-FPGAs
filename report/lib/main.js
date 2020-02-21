"use strict";

/// Global variables

// map< fileinfo.index, position of fileinfo in fileInfos array (which is
// the same as the tab index)>
// i.e. map< file index, tab index >
var tabIndexMap = {};
var VIEWS = {
    NONE:        { value: 0 },
    SUMMARY:     { value: 1 },
    OPT:         { value: 2 },
    AREA_SYS:    { value: 3 },
    AREA_SRC:    { value: 4 },
    SPV:         { value: 5 }
    };

// vector< fileInfo objects >
var fileInfos;
var loopsAnalysis;
var areaSystem;
var areaSource;
var detailValues = [];
var detailIndex = 0;
var curFile;
var spv_graph;
var detailOptValues = [];

var spv;
var sideCollapsed = false;
var detailCollapsed = false;
var view = VIEWS.OPT;
var mavData = mavJSON;

var LOOP_ANALYSIS_NAME = "Loops analysis  <span style='float:right'><input id='showFullyUnrolled' type='checkbox' checked='checked' value='Fully unrolled loops'>&nbspShow fully unrolled loops&nbsp</span>";
var REPORT_PANE_HTML = "<div class='classWithPad' id='opt-area-panel'><div class='panel panel-default' id='report-panel-body'><div class='panel-heading'>";
var NO_SOURCE = "No Source Line";

function
main()
{
    var activeKernel = 0;

    // map < file name, file index > (The map used by the compiler)
    var fileIndexMap = mavData.fileIndexMap;
    // 1. Gather file names and content in one structure
    fileInfos = parseFileInfos();

    tabIndexMap = createTabIndexMap( fileInfos );

    // Get area and optimization report
    parseAreaTables();
    parseLoopTable();
    setInitialSummary();

    // 3. For each source file, add a tab in the editor pane
    addFileTabs( fileInfos );

    // 4. Add file contents
    addFileContents( fileInfos );

    // 5. Add onclick functions to report tabs (they're already statically added
    // in index.html) 
    addReportTabs();

    adjustToWindowEvent();

    verifyThings();
    
    ///// Functions

    /// main::parseAreaTables
    function
    parseAreaTables()
    {

        // System view variables
        var table = "";

        // Source View variables
        var tableSource = "";

        // Common variables
        var area           = areaJSON
            , totalData    = [0, 0, 0, 0]
            // Max available device resources for user design partition (eg. kernel partition)
            , totalMaxData = area.max_resources
            , indent       = 21
            , baseLevel    = 0;

        // add details for Data Control Overhead (source view)
        detailValues.push("<b>Data control overhead:</b><br><ul><li>State + Feedback + Cluster Logic</li></ul>");
        detailIndex = 1;

        // add resources
        var result = createHighLevels(area.resources, baseLevel + 1, []);
        sumResources(totalData, result.data);
        table += result.rows;
        tableSource += table;

        // add functions
        var funcLevel = baseLevel + 1;
        var functionList = [];
        area.functions.forEach( function(d) {
            var functionData = [0, 0, 0, 0];
            var overhead = [0, 0, 0, 0];
            var sourceLines = [];
            var functionRow = "";

            var funcResults = createHighLevels(d.resources, funcLevel + 1, sourceLines);
            sumResources(functionData, funcResults.data);

            // Add function basic blocks
            var basicBlock = "";
            var blockList = [];
            d.basicblocks.forEach ( function(b) {
                var blockData = [0, 0, 0, 0];
                var block = "";
                var blockRow = "";

                // Add block resources
                var bbResults = createHighLevels(b.resources, funcLevel + 2, sourceLines);
                block += bbResults.rows;
                sumResources(blockData, bbResults.data);
                sumResources(overhead, bbResults.overhead);

                // Add computation
                if (b.hasOwnProperty('computation') && b.computation.length != 0) {
                    var compResults = createHighLevels(b.computation, funcLevel + 3, sourceLines);
                    block += createRow("Computation", compResults.data, [""], -1, funcLevel + 2, "", true);
                    sumResources(blockData, compResults.data);
                    sumResources(overhead, compResults.overhead);
                    block += compResults.rows;
                }

                // Add block name row to table
                var details = b.hasOwnProperty('details') ? b.details : [""];
                blockRow = createRowWithUtilization(b.name, blockData, totalMaxData,
                                                       details, -1, funcLevel + 1, "", b.resources.length+b.computation.length)
                                                       .replace(/res-row collapse/g, 'basicblock-totalres-row collapse');
                blockRow += block;
                // Add block data to columns
                sumResources(functionData, blockData);
                blockList.push({ "name": b.name, "row": blockRow });
            }); // basic block

            // Sort Block names
            blockList.sort(nameSort);
            for (var i = 0; i < blockList.length; ++i) {
                basicBlock += blockList[i].row;
            }

            // add function name row
            var functionInfo = "";
            var details = d.hasOwnProperty('details') ? d.details : [""];
            if (funcResults.rows != "" || basicBlock != "") {
                functionInfo += createRowWithUtilization(d.name, functionData, totalMaxData, details, -1, baseLevel + 1, "", true)
                    .replace(/res-row collapse/g, 'function-totalres-row collapse');
            } else {
                functionInfo += createRowWithUtilization(d.name, functionData, totalMaxData, details, -1, baseLevel + 1, "", false)
                    .replace(/res-row collapse/g, 'function-totalres-row collapse');;
            }

            // add source view table
            tableSource += functionInfo;
            tableSource += parseSourceInfo(overhead, funcResults.rows, sourceLines);

            // add system view to table
            functionRow += functionInfo + funcResults.rows + basicBlock;
            functionList.push({ "name": d.name, "row": functionRow });

            // add totalData
            sumResources(totalData, functionData);
        }); // function

        // Sort Block names
        functionList.sort(nameSort);
        for (var i = 0; i < functionList.length; ++i) {
            table += functionList[i].row;
        }

        // add partitions
        var tableStart = createTableHeader();
        area.partitions.forEach( function (p) {
            var partResults = createHighLevels(p.resources, 1, []);
            var details = p.hasOwnProperty('details') ? p.details : [""];
            var partitionInfo = createRow(p.name, partResults.data, details, -1, baseLevel, "", true)
                                          .replace(/res-row collapse/g, 'partition-totalres-row collapse');
            tableStart += partitionInfo;
            tableStart += partResults.rows;
        });

        var systemName = area.name + " (Logic: " + Math.round(area.total_percent[0]) + "%)";
        var details = area.hasOwnProperty('details') ? area.details : [""];
        tableStart += createRowWithUtilization(systemName, totalData, totalMaxData, details, -1, baseLevel, "", true)
                                               .replace(/res-row collapse/g, 'module-totalres-row collapse');

        table = tableStart + table + "</tbody>";
        tableSource = tableStart + tableSource + "</tbody>";

        areaSystem = table;
        areaSource = tableSource;

        /// parseAreaTable::sumResources
        function
        sumResources(data1, data2)
        {
            for (var i = 0; i < data1.length; ++i) { data1[i] += data2[i]; }
        }

        /// parseAreaTables::createTableHeader
        function
        createTableHeader()
        {
            var table_header = "";

            table_header += "<thead><tr class='res-heading-row' data-ar-vis=0 data-level=" + baseLevel + " id='table-header'><th class='res-title'></th>";
            area.columns.forEach( function(h) {
                table_header += "<th class='res-val'>" + h + "</th>";
            });
            table_header += "<th class='res-val'>Details</th></tr></thead>";

            // Spacer row
            table_header += "<tbody><tr data-level=" + baseLevel + " id='first-row'><td>Spacer</td><td></td><td></td><td></td><td></td><td>Details</td></tr>";

            return table_header;
        }

        /// parseAreaTables::createRowWithUtilization
        function
        createRowWithUtilization(title, data, maxData, details, line, level, filename, parent)
        {
            var row = "";

            // add title and link to editor pane
            if (parent) { row += "<tr class='res-row collapse parent' data-ar-vis=0 data-level=" + level; }
            else { row += "<tr class='res-row collapse' data-ar-vis=0 data-level=" + level;}

            row += " index=" + detailIndex;
            if (line != -1) { row += " onClick='syncEditorPaneToLine(" + line + ", \"" + filename + "\")'"; }

            if (parent) {
                row += "><td class='res-title' style=\'padding-left:" + level * indent + "px;\'><a href='#' class=\'ar-toggle glyphicon glyphicon-chevron-right\' style=\'color:black;padding-left:2px;\'></a>&nbsp" + title + "</td>";
            } else {
                row += "><td class='res-title' style='padding-left:" + level * indent + "px;'>" + title + "</td>";
            }

            // add data columns
            for (var i = 0; i < data.length; i++) {
                row += "<td class='res-val'>" + Math.round(data[i]);
                if (maxData) {
                    // Add percent utilization if max values are given.
                    row += " (" + Math.round(data[i] / maxData[i] * 100) + "%)";
                }
                row += "</td>";
            }

            // add details column
            if (details == undefined || details[0] == "") {
                row += "<td class='res-val'></td>";
                detailValues.push("");
            }
            else {
                row += "<td class='res-val' >"
                var detailEntry = "<ul>";
                details.forEach( function (d) {
                    row += "<li>" + d.substring(0, 10) + "..." + "</li>"
                    detailEntry += "<li>" + d + "</li>"
                });
                detailEntry += "</ul>";
                row += "</td>";
                detailValues.push("<b>" + title + ":</b><br>" + detailEntry);
            }
            detailIndex += 1;
            row += "</tr>";

            return row;
        }

        /// parseAreaTables::createRow
        function
        createRow(title, data, details, line, level, filename, parent)
        {
            return createRowWithUtilization(title, data, null, details, line, level, filename, parent);
        }

        /// parseAreaTables::createSourceItem
        function
        createSourceItem(line, itemName, data, subinfos, parent, filename, isLineHeader, count)
        {
            var tempItem = {};
            if (parent) { tempItem.line = line; }
            tempItem.name = itemName;

            if (!parent) {
                tempItem.data = [];
                data.forEach( function(d) {
                    tempItem.data.push(d);
                });
            }
            else { tempItem.data = [0, 0, 0, 0]; }
            tempItem.highlight = isLineHeader;
            tempItem.subinfos = subinfos;
            tempItem.filename = filename;
            tempItem.count = count;

            return tempItem;
        }

        /// parseAreaTables::addSourceItem
        function
        addSourceItem(parentName, line, itemName, data, filename, sourceLines, count)
        {
            var index = 0;
            var found = false;

            // Find parent object of same line
            for (var i = 0; i < sourceLines.length; i++) {
                if (sourceLines[i].line == line) {
                    found = true;
                    index = i;
                    break;
                }
            }

            // Create parent object of same line if not found
            if (!found) {
                if (itemName == NO_SOURCE) sourceLines.push(createSourceItem(line, NO_SOURCE, data, [], true, filename, true, 0));
                else sourceLines.push(createSourceItem(line, (filename + ":" + line), data, [], true, filename, true, 0));
                index = sourceLines.length - 1;
            }

            // Add item to proper level
            found = false;
            if (itemName == (filename + ":" + line) || itemName == NO_SOURCE) {
                sourceLines[index].subinfos.forEach( function(sub) {
                    if (sub.name == parentName) {
                        found = true;
                        for (var i = 0; i < 4; i++) {
                            sub.data[i] += data[i];
                        }
                        if (itemName == NO_SOURCE) sub.count = 0;
                        else if (count == 0) sub.count += 1;
                        else sub.count += count;
                    }
                });
                if (!found) { sourceLines[index].subinfos.push(createSourceItem(0, parentName, data, [], false, filename, false, count)); }
            } else {
                sourceLines[index].subinfos.forEach ( function(f) {
                    if (f.name == itemName) {
                        f.subinfos.forEach( function(sub) {
                            if (sub.name == parentName) {
                                found = true;
                                for (var i = 0; i < 4; i++) {
                                    sub.data[i] += data[i];
                                }
                                if (count == 0) sub.count += 1;
                                else sub.count += count;
                            }
                        });

                        if (!found) {
                            f.subinfos.push(createSourceItem(0, parentName, data, [], false, filename, false, count));
                        }
                        sumResources(f.data, data);
                        found = true;
                    }
                });
                if (!found) {
                    sourceLines[index].subinfos.push(createSourceItem(0, itemName, data, 
                                                                      [createSourceItem(0, parentName, data, [], false, filename, false, count)],
                                                                      false, filename, false, 0));
                }
            } 

            sumResources(sourceLines[index].data, data);

            return sourceLines;
        }

        /// parseAreaTables::createHighLevels
        function
        createHighLevels(varIter, dataLevel, sourceLines)
        {
            // Return an object containing the sum of the area usage of all elements
            // in varIter and all the HTML table rows for every element in varIter.
            // The HTML table rows are sorted first by line number and then by name.

            var resourceList = [];
            var sumData = [0, 0, 0, 0];
            var overheadData = [0, 0, 0, 0];

            varIter.forEach ( function(g) {
                var isChildofLine = false;
                var isAddedToOverhead = false;
                var parent = true;
                var line = -1;
                var filename = "";
                var details = [""];
                var row = "";

                // Check if parent and if item has corresponding line number before assigning properties
                if (!g.hasOwnProperty('subinfos') || g.subinfos.length == 0) { parent = false; }

                if (g.hasOwnProperty('debug') && g.debug[0][0].line != 0) {
                    line = g.debug[0][0].line;
                    filename = getFilename(g.debug[0][0].filename);
                }

                // Add data to running total of Data Control Overhead in Source view
                if ((!g.hasOwnProperty('subinfos') || g.subinfos.length == 0) || g.name == "Feedback") {
                    sumResources(overheadData, g.data);
                    isAddedToOverhead = true;
                } else if (g.hasOwnProperty('debug') && g.hasOwnProperty('subinfos') && g.debug[0][0].line != 0) {
                    isChildofLine = true;
                }

                // Add data to running total of row
                sumResources(sumData, g.data);

                if (g.hasOwnProperty('details')) { details = g.details; }

                row += createRow(g.name, g.data, details, line, dataLevel, filename, parent);

                // Add subinfos
                if (g.hasOwnProperty('subinfos')) {
                    var subinfoList = [];
                    g.subinfos.forEach( function(s) {
                        var line = -1;
                        var filename = "";
                        var linename = s.info.name;
                        var subRow = "";

                        if (s.info.hasOwnProperty('debug') && s.info.debug[0][0].line != 0) {
                            line = s.info.debug[0][0].line;
                            filename = getFilename(s.info.debug[0][0].filename);
                        }

                        if (s.hasOwnProperty('count') && s.count > 1) linename += " (x" + s.count + ")";

                        subRow = createRow(linename, s.info.data, [""], line, (dataLevel + 1), filename, false);
                        subinfoList.push({ "name": linename, "row": subRow });

                        // Add items to source view
                        if (g.name != "Feedback" && s.info.hasOwnProperty('debug') && s.info.debug[0][0].line != 0) {
                            addSourceItem(g.name, s.info.debug[0][0].line, s.info.name, s.info.data,
                                            getFilename(s.info.debug[0][0].filename), sourceLines, s.count);
                        } else if (isChildofLine) {
                            addSourceItem(s.info.name, g.debug[0][0].line, g.name, s.info.data,
                                            getFilename(g.debug[0][0].filename), sourceLines, s.count);
                        } else if (!isAddedToOverhead) {
                            if (g.name == NO_SOURCE)
                                addSourceItem(s.info.name, -1, NO_SOURCE, s.info.data,"", sourceLines, 0);
                            else if (s.info.name != NO_SOURCE)
                                sumResources(overheadData, s.info.data);
                            else
                                addSourceItem(g.name, -1, NO_SOURCE, s.info.data, "", sourceLines, 0);
                        }
                    }); // subinfo

                    subinfoList.sort(nameSort);
                    for (var i = 0; i < subinfoList.length; ++i) {
                        row += subinfoList[i].row;
                    }
                }

                resourceList.push({ "line": line, "name": g.name, "row": row });
            });

            resourceList.sort(function (data1, data2) {
                // Sort by line number first and then by name.
                if (data1.line != data2.line) return data1.line - data2.line;
                if (data1.name < data2.name) return -1;
                if (data1.name > data2.name) return 1;
                return 0;
            });

            var allRows = "";
            for (var i = 0; i < resourceList.length; ++i) {
                allRows += resourceList[i].row;
            }

            return { "data": sumData, "overhead": overheadData, "rows": allRows };
        }

        function
        nameSort(data1, data2)
        {
            var isUpper1 = (data1.name[0] && data1.name[0] == data1.name[0].toUpperCase());
            var isUpper2 = (data2.name[0] && data2.name[0] == data2.name[0].toUpperCase());

            //  undefined, {numeric: true, sensitivity: 'case'}
            if      ( isUpper1 && !isUpper2) return -1;
            else if ( isUpper2 && !isUpper1) return 1;
            else return data1.name.localeCompare(data2.name, 'en-US-u-kn-true');
        }

        /// parseAreaTables::parseSourceInfo
        function
        parseSourceInfo(overhead, funcRows, sourceLines)
        {
            var sourceTable = "";

            sourceTable += "<tr class='res-row collapse' data-ar-vis=0 data-level=" + (funcLevel + 1)
                        + " index=0><td class='res-title' style=\'padding-left:" + ((funcLevel + 1) * indent)
                        + "px'>Data control overhead</td>";
            overhead.forEach( function(ov) {
                sourceTable += "<td class='res-val'>" + Math.round(ov) + "</td>";
            });
            sourceTable += "<td class='res-val'><li>" + ("State + Feedback + Cluster Logic").substring(0, 10) + "..." + "</li></td></tr>";
            sourceTable += funcRows;

            sourceTable += addSubHeadings(sourceLines, 0, funcLevel + 1);
            return sourceTable;
        }

        /// parseAreaTables::addSubHeadings
        function
        addSubHeadings(tRows, line, level)
        {
            var subTable = "";
            var rowName = "";

            tRows.forEach( function(row) {
                if (level == 2) { line = row.line; }
                if (row.highlight) { subTable += createRow(row.name, row.data, [""], line, level, row.filename, row.subinfos.length).replace(/res-row collapse/g, 'basicblock-totalres-row collapse'); }
                else {
                    if (row.count > 1) rowName = row.name + "(x" + row.count + ")";
                    else rowName = row.name;
                    subTable += createRow(rowName, row.data, [""], line, level, row.filename, row.subinfos.length);
                }

                if (row.subinfos.length != 0) { subTable += addSubHeadings(row.subinfos, line, (level + 1)); }
            });
            return(subTable);
        }
    }

    /// main::parseLoopTable
    function 
    parseLoopTable() {
        var loop = loopsJSON
            , indent = 12;

        if (loop.functions.length == 0) {
            loopsAnalysis = "<i>&nbspDesign has no loops</i>";
            return;
        }

        var first = true;

        loopsAnalysis = createTableHeader();

        // Index 0 is reserve for empty string, start at 1
        detailOptValues.push("")
        detailIndex = 1;

        loop.functions.forEach( function(d) {
            loopsAnalysis += addResource(d);
        });

        loopsAnalysis += "</tbody>"

        /// parseLoopTable::createTableHeader
        function 
        createTableHeader() {
            var table_header = "";

            table_header += "<thead><tr class='res-heading-row' data-ar-vis=0 data-level=0 id='table-header'><th class='res-title'></th>";
            loopsJSON.columns.forEach(function (h) {
                table_header += "<th class='res-val'>" + h + "</th>";
            });
            table_header += "<th class='res-val'>Details</th></tr></thead>";

            // Spacer row with fake data
            table_header += "<tbody><tr data-level=0 id=first-row><td>Spacer</td>";
            loopsJSON.columns.forEach(function (h) {
                table_header += "<td>" + h + "</td>";
            });
            table_header += "<td>Details</td></tr>";  // use two Details words as default spacing

            return (table_header);
        }

        /// parseLoopTable::createRow
        function
        createRow(title, data, details, line, level, filename, resources)
        {
            var row = "<tr class='res-row ";
            var hasDetails = true;
            if (details == undefined || details.length == 0) {
                hasDetails = false;
            }

            // Custom class to show/hide Fully unrolled loops
            if (title == "Fully unrolled loop") { row += " ful" }

            row += "'"

            // Assign optIndex to 0 if no details or to a value
            if (hasDetails) { row += " optIndex=" + detailIndex; }
            else { row += " optIndex=0"; }

            if (line > 0) { row += " onClick='syncEditorPaneToLine(" + line + ", \"" + filename + "\")'"; }


            row += "><td class='res-title' style='text-indent:" + level*indent + "px'>";
            row += title + " (";
            if (line > 0) { row += filename + ":" + line; }
            else if (line == 0) { row += filename; }
            else { row += "Unknown location"; }
            row  += ")</td>";

            // add data columns
            for (var i = 0; i < data.length; i++) {
                row += "<td class='res-val'>" + data[i] + "</td>";
            }
            
            // add details column
            if (hasDetails) { row += "<td class='res-val' >" + details[0] + "</td>"; }
            else { row += "<td class='res-val'></td>"; }

            // details section
            if (resources != undefined && resources.length > 0) {
                var infohtml = "<b>" + title + ":</b><br>";
                for (var ri = 0; ri < resources.length; ri++) {
                    infohtml += resources[ri].name + "<br>";
                    if (resources[ri].subinfos == undefined) {
                        continue;
                    }
                    infohtml += "<ul>"
                    var subinfos = resources[ri].subinfos;
                    for (var i = 0; i < subinfos.length; i++) {
                        if (subinfos[i].info.debug != undefined && subinfos[i].info.debug[0].length > 0) {
                            var infoFilename = getFilename(subinfos[i].info.debug[0][0].filename);
                            var infoLine = subinfos[i].info.debug[0][0].line;
                            //var infoNodeId = subinfos[i].info.debug[0][0].nodeId;  //Feature in 17.0 Add node ID to debug info
                            infohtml += "<li>" + subinfos[i].info.name + " (";
                            infohtml += "<a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoFilename + ":" + infoLine + "</a>";

                            // there can be multiple debug location, i.e. LSU merge
                            for (var di = 1; di < subinfos[i].info.debug[0].length; di++) {
                                infoLine = subinfos[i].info.debug[0][di].line;
                                if (infoFilename != getFilename(subinfos[i].info.debug[0][di].filename)) {
                                    infoFilename = getFilename(subinfos[i].info.debug[0][di].filename);
                                    infohtml += ", <p style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoFilename + ":" + infoLine + "</p>";
                                }
                                else {
                                    infohtml += ", <a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoLine + "</a>";
                                }
                            }
                            infohtml += ")";
                        } else {
                            infohtml += "<li>" + subinfos[i].info.name + " (Unknown location)";
                        }
                        infohtml += "</li>";
                    }
                    infohtml += "</ul>";
                }
                detailOptValues.push(infohtml);
                detailIndex += 1;
            }
            else {
                if (hasDetails) {
                    detailOptValues.push("<b>" + title + ":</b><br>" + details[0]);
                    detailIndex += 1;
                }
            }
            row += "</tr>";
            return (row);
        }

        /// parseLoopTable::addResource
        function
        addResource(r)
        {
            var line = -1;
            var filename = "";
            var details = "";
            var level = 0;

            if (r.hasOwnProperty('debug') && r.debug[0].length > 0) {
                line = r.debug[0][0].line;
                if (line > 0) { filename = getFilename(r.debug[0][0].filename); }
                else { filename = r.debug[0][0].filename; }
                level = r.debug[0][0].level;
            }

            return createRow(r.name, r.data, r.details, line, level, filename, r.resources);
        }

    }
    /// main::setInitialTable
    function
    setInitialSummary()
    {
        var report = "";

        report += REPORT_PANE_HTML;
        report += LOOP_ANALYSIS_NAME;
        report += "</div><div class='panel-body' id='report-body'>";
        report += "<table class='table table-hover' id='area-table-content'>";
        report += loopsAnalysis;
        report += "</table></div></div></div>";

        $('#area-opt-pane').html(report);
        $('#spv-pane').toggle();
    }

    /// main::parseFileInfos
    function
    parseFileInfos()
    {
        var fileInfos = [];

        fileInfos = fileJSON ;
        curFile = fileInfos[0].name;

        // Replace the file info indices with those from the fileIndexMap
        var i = 0;
        while (i < fileInfos.length) {
            var index = fileIndexMap[ fileInfos[i].path ];
            if (!index) {
                fileInfos.splice(i, 1);
                continue;
            }
            assert( index > 0, "File index below 0!" );
            fileInfos[i].index = index;
            i++;
        }

        verifyFileInfos( fileInfos );

        return fileInfos;
    }

    /// main::getFileContents
    function
    getFileContents( filePath )
    {
        var file = filePath;
        return filePath;
    }

    /// main::verifyFileInfos
    function
    verifyFileInfos( fileInfos )
    {
        fileInfos.forEach( function( d ) {
            assert( d.index == fileIndexMap[ d.path ], "FileInfo's invalid!" );
        });
    }

    /// main::createTabIndexMap
    function
    createTabIndexMap( fileInfos )
    {
        var tabIndexMap = {};
        fileInfos.forEach( function( d, i ) {
            tabIndexMap[ d.index ] = i;
        } );
      
        return tabIndexMap;
    }

    /// main::addReportTabs
    function
    addReportTabs()
    {
        // Any time a tab is shown, update the contents
        $( document ).on( 'shown.bs.tab', 'a[data-toggle="tab"]', function( e ) {
            var anchor = e.target;
        });
    }

    /// main::verifyThings
    function
    verifyThings()
    {
        // 1. Verify fileIndex/tabIndex maps:
        for( var filename in fileIndexMap ) {
            if ( !fileIndexMap.hasOwnProperty( filename ) ) continue;

            var fileIndex = fileIndexMap[ filename ];
            var tabIndex = tabIndexMap[ fileIndex ];
            assert( tabIndex === parseInt( tabIndex ), "tabIndex is not an integer!" ); // Ensure is integer

            // Get the tab at that index
            var theTab = $( "#editor-pane .nav-tabs" ).children().eq( tabIndex );
            // Now check that the filename (full file path) ends with the tab name
            assert( filename.endsWith( theTab.text() ), "Filepath doesn't end with tab name!" );
        }
    }
}

// TODO Any functions that are called only once should be moved to the
// callee body

function
addFileTabs( fileInfos )
{
    var navTabs = d3.select( "#editor-pane" ).selectAll( "#editor-pane-nav" );
    var listElements = navTabs.selectAll( "li" )
        .data( fileInfos )
        .enter()
        .append( "li" )
        .attr( "class", function( d, i ) {
            var classname = "";
            if (i == 0) {
                classname = "active";
                $('.selected').html(d.name);
            }
            return classname;
        });

    var anchors = listElements  
        .append( "a" )
        .attr( "href", function( d ) { return "#file" + d.index; } )
        .text( function( d ) { return d.name; });

    $( "#editor-pane-nav" ).on( "click", "a", function( e ) {
        $(this).tab("show");
        $("#editor-pane-nav li").attr("class", "");
        $(this).attr("class", "active");

        $('.selected').html($(this).text());
    });
}

function
addFileContents( fileInfos )
{
    var tabContent = d3.select( "#editor-pane" ).selectAll( ".tab-content" );

    var divs = tabContent.selectAll( "div" )
        .data( fileInfos )
        .enter()
        .append( "div" )
        .attr( "class", function( d, i ) {
            var classname = "tab-pane";
            if ( i == 0 ) classname = classname + " in active";
            return classname;
        })
        .attr( "id", function( d ) { return "file" + d.index; } )
        .attr( "style", "height:500px;" );

    var editorDivs = divs
        .append( "div" )
        .attr( "class", "well" );

    editorDivs.each( setupEditor );

    /// Functions
    function
    setupEditor( fileInfo )
    {
        var editor = ace.edit( this ); // "this" is the DOM element
        fileInfo.editor = editor;

        editor.setTheme( "../ace/theme/xcode" );
        editor.setFontSize( 12 );
        editor.getSession().setMode( "../ace/mode/c_cpp" );
        editor.getSession().setUseWrapMode( true );
        editor.getSession().setNewLineMode( "unix" );

        // Replace \r\n with \n in the file content (for windows)
        editor.setValue( fileInfo.content.replace( /(\r\n)/gm, "\n" ) );
        editor.setReadOnly( true );
        editor.scrollToLine( 1, true, true, function() {} );
        editor.gotoLine( 1 );
    }
}

///// Global functions

/// Syncs the editor and details pane to this node
function
syncPanesToNode( node )
{
    syncEditorPaneToNode( node );
}

// Assumes the node has the file index and line number 
// in "file" and "line" respectively
function
syncEditorPaneToNode( node )
{
    // Note: This check returns true if node.file is undefined or if it's  0
    // This is good because file index 0 is used for unknown
    if ( !node.file ) return;

    var tabIndex = tabIndexMap[ node.file ];
    var target = "li:eq(" + tabIndex + ")";
    $( "#editor-pane-nav " + target + " a" ).tab( "show" );

    var editor = fileInfos[ tabIndex ].editor;
    assert( editor, "Editor invalid!" );
    var line = node.line;
    assert( line > 0, "Editor line number is less than or equal to 0!" );
    editor.focus();
    editor.resize( true );
    editor.scrollToLine( line, true, true, function() {} );
    editor.gotoLine( line );
}

function
adjustToWindowEvent()
{
    setReportPaneHeight();
    if (view != 4) stickTableHeader();
    if (!sideCollapsed) adjustEditorButtons();
}

function resizeEditor()
{
    if (sideCollapsed) return;

    var editor;
    for (var i = 0; i < fileInfos.length; i++) {
        if (fileInfos[i].name == curFile) {
            editor = fileInfos[i].editor;
            break;
        }
    }
    editor.resize();
}

// navigation bar tree toggle
$(document).ready(function () {
    $('label.tree-toggle').click(function () {
        $(this).parent().children('ul.tree').toggle(200);
    });

    $(window).resize(function () {
        adjustToWindowEvent();
    });

    function getChildren($row) {
        var children = [], level = $row.attr('data-level');
        var isExpanding;
        var maxExpandedLevel = Number(level) + 1;

        // Check if expanding or collapsing
        if ($row.next().is(":hidden")) {
            isExpanding = true;
        } else {
            isExpanding = false;
        }

        while($row.next().attr('data-level') > level) {
            // Always expand or collapse immediate child
            if($row.next().attr('data-level')-1 == level) {
                children.push($row.next());
                $row.next().attr('data-ar-vis',$row.next().attr('data-ar-vis')==1?0:1);
            } else {
                // expand if previously was expanded and parent has been expanded - maxExpandedLevel is used to tell if a child's immediate parent has been expanded
                if ($row.next().attr('data-ar-vis')==1 && isExpanding && $row.next().attr('data-level')<=(maxExpandedLevel+1)) {
                    children.push($row.next());
                    maxExpandedLevel = Math.max(maxExpandedLevel, $row.next().attr('data-level'));
                    // collapse if visible and element is some descendant of row which has been clicked
                } else if (!isExpanding && $row.next().is(":visible")) {
                    children.push($row.next());
                }
            }
            $row = $row.next();
        }
        return children;
    }

    function addReportColumn(reportEnum, whichTable) {
        var report = "";

        report += REPORT_PANE_HTML;

        if (reportEnum == VIEWS.OPT) {            
	          report += LOOP_ANALYSIS_NAME;
            report += "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
            report += "<table class='table table-hover' id='area-table-content'></table>";
        } else if (reportEnum == VIEWS.AREA_SYS || reportEnum == VIEWS.AREA_SRC) {
            report += "Area report " + whichTable + "<br>(area utilization values are estimated) <br>Notation <i>file:X</i> > <i>file:Y</i> indicates a function call on line X was inlined using code on line Y.";
            if (!areaJSON.debug_enabled) {
                report += "<br><strong>Recompile without <tt>-g0</tt> for detailed area breakdown by source line.</strong>";
            }
            report += "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
            report += "<table class='table table-hover' id='area-table-content'></table>";
        } else if (reportEnum == VIEWS.SPV) {
            report += "System viewer";
            report += "</div><div id='SPG' class='panel-body fade in active'></div>";
        }

        report += "</div></div></div>";

        $('#area-opt-pane').html(report);
    }

    function refreshAreaVisibility() {
        $('#area-table-content tr').each(function() {
            if ($(this).attr('data-level') == 0 && $(this).is(":hidden")) {
                $(this).toggle();
            }
        });
    }

    // Expand or collapse when parent table row clicked
    $('#report-pane').on('click', '.parent', function() {
        var children = getChildren($(this));
        $.each(children, function () {
            $(this).toggle();
        });
        $(this).find('.ar-toggle').toggleClass('glyphicon-chevron-down glyphicon-chevron-right');
        stickTableHeader();
    });

    // Display details on mouseover
    $('#report-pane').on('mouseover', 'tr', function() {
        if ($(this).attr('index')) {
         changeDivContent(VIEWS.AREA_SYS, $(this).attr('index'));
       } else if ($(this).attr('optIndex')) {
         changeDivContent(VIEWS.OPT, $(this).attr('optIndex'));
        }
    });

    $('#sys_nav').on('click', function () {
        if (view == VIEWS.SPV) {
            $('#spv-pane').toggle();
            $('#area-opt-pane').toggle();
        }
        if (view != VIEWS.AREA_SYS) {
            addReportColumn(VIEWS.AREA_SYS, "(system view)");
            $('#area-table-content').html(areaSystem);
            refreshAreaVisibility();
        }
        view = VIEWS.AREA_SYS;
        adjustToWindowEvent();
    });

    $('#source_nav').on('click', function () {
        if (view == VIEWS.SPV) {
            $('#spv-pane').toggle();
            $('#area-opt-pane').toggle();
        }
        if (view != VIEWS.AREA_SRC) {
            addReportColumn(VIEWS.AREA_SRC, "(source view)");
            $('#area-table-content').html(areaSource);
            refreshAreaVisibility();
        }
        view = VIEWS.AREA_SRC;
        adjustToWindowEvent();
    });

    $('#vis_nav').on('click', function() {
        if (view != VIEWS.SPV) {
            $('#spv-pane').toggle();
            $('#area-opt-pane').toggle();
            if (!spv_graph) spv_graph = new startGraph(mavData);
            else spv_graph.refreshGraph();
        }
        view = VIEWS.SPV;
        adjustToWindowEvent();
    });

    $('#loop_nav').on('click', function() {
        addReportColumn(VIEWS.OPT, "");
        $('#area-table-content').html(loopsAnalysis);
        if (view == VIEWS.SPV) {
            $('#spv-pane').toggle();
            $('#area-opt-pane').toggle();
        }
        view = VIEWS.OPT;
        adjustToWindowEvent();
    });

    $('#collapse_source').on('click', collapseAceEditor);
    $('body').on('click', '#close-source', function () {
        collapseAceEditor()
        flashMenu();
    });

    $('#collapse_details').on('click', collapseDetails);
    $('body').on('click', '#close-details', function () {
        collapseDetails();
        flashMenu();
    });
    
    $('#report-pane').on('click', '#showFullyUnrolled', function() {
        $('.ful').each(function () {
            $(this).toggle();
        });
    });
});

function
flashMenu()
{
    var $menuElement = $('#collapse_sidebar');
    var interval = 500;
    $menuElement.fadeIn(interval, function () {
        $menuElement.css("color", "#80bfff");
        $menuElement.css("border", "1px solid #80bfff");
        $menuElement.fadeOut(interval, function () {
            $menuElement.fadeIn(interval, function () {
                $menuElement.fadeOut(interval, function () {
                    $menuElement.fadeIn(interval, function () {
                        $menuElement.css("color", "black");
                        $menuElement.css("border", "1px solid transparent");
                    });
                });
            });
        });
    });
}

function
collapseDetails()
{
    $('#detail-pane').toggle();
    detailCollapsed = (detailCollapsed) ? false : true;
    adjustToWindowEvent();
    resizeEditor();
}

function
collapseAceEditor()
{
    $('#editor-pane').toggle();
    if (sideCollapsed) {
        $('#report-pane').css('width', '60%');
        sideCollapsed = false;
    } else {
        $('#report-pane').css('width', '100%');
        sideCollapsed = true;
    }
    adjustToWindowEvent();
}

// Forces header of area report to remain at the top of the area table during scrolling
// (the header is the row with the column titles - ALUTs, FFs, etc.)
function
stickTableHeader()
{
    if (!document.getElementById("report-body")) return;
    var panel = document.getElementById("report-body").getBoundingClientRect();
    var table = document.getElementById("area-table-content").getBoundingClientRect();
    var rowWidth = 0.0;
    var tableWidth = table.width;
    var systemRow;

    var tableHeader = $('#table-header').filter(function () {
        if ($(this).is(":visible")) return true;
        return false;
    });

    systemRow = $('#first-row')
        .filter(function () {
            if ($(this).is(":visible")) return true;
            return false;
        });

    tableHeader.css("position", "absolute")
        .css("top", (panel.top - table.top))
        .css("left", 0)
        .css("height", systemRow.outerHeight());

    tableHeader.find('th').each(function (i) {
        var itemWidth = (systemRow.find('td').eq(i))[0].getBoundingClientRect().width;
        rowWidth += itemWidth;

        $(this).css('min-width', itemWidth);
    });

}

function
adjustEditorButtons()
{
    var editorWidth = $("#editor-pane").width();
    var editorExitButton = $("#close-source").outerWidth(true);
    $("#editor-nav-button").css("width", editorWidth - editorExitButton - 1);
}

function
setReportPaneHeight()
{
    var viewPortHeight = $(window).height();
    var navBarHeight = $(".navbar-collapse").height();
    var detailHeight = (detailCollapsed) ? 0 : $("#detail-pane").height();
    $('#report-pane, #editor-pane').css('height', viewPortHeight - navBarHeight - detailHeight);

    var panelHeight = $("#report-pane").height();
    if (view == VIEWS.OPT || view == VIEWS.AREA_SYS || view == VIEWS.AREA_SRC) {
        var panelHeadingHeight = $('#area-opt-pane .panel-heading').outerHeight();
        $('#report-body').css('height', panelHeight - panelHeadingHeight);
        $('#area-opt-pane').css('height', $('#report-pane').innerHeight());
    } else if (view == VIEWS.SPV) {
        var panelHeadingHeight = $('#spv-pane .panel-heading').outerHeight();
        $('#SPG').css('height', panelHeight - panelHeadingHeight);
        $('#spv-pane').css('height', $('#report-pane').innerHeight());
    }

    var editorHeadingHeight = $('.input-group-btn').outerHeight();
    $('.tab-pane').css('height', panelHeight - editorHeadingHeight);

}

function
changeDivContent(curView, idx, detailsArray)
{
    if (curView == VIEWS.AREA_SYS || curView == VIEWS.AREA_SRC) {
        document.getElementById("details").innerHTML = "<ul class='details-list'>".concat(detailValues[idx], "</ul>");
    } else if (curView == VIEWS.SPV) {
        var detailsTable = "<table id='DetailsTable'>";
        detailsArray.forEach( function(da) {
            detailsTable += "<tr><td>" + da.first + "</td><td>" + da.second + "</td></tr>";
        });
        detailsTable += "</table>";
        document.getElementById("details").innerHTML = detailsTable;
    } else if (curView == VIEWS.OPT) {
        document.getElementById("details").innerHTML = detailOptValues[idx]
    }
}

function
syncEditorPaneToLine( line, filename )
{
    var node;
    var editor;
    var index = 0;

    if (line == -1) return;
    curFile = filename;

    for (var i = 0; i < fileInfos.length; i++) {
        if (fileInfos[i].name == filename) {
            editor = fileInfos[i].editor;
            index = fileInfos[i].index;
            break;
        }
    }
    assert( editor, "Editor invalid!" );
    var tabIndex = tabIndexMap[ index ];
    var target = "li:eq(" + tabIndex + ")";
    $( "#editor-pane-nav " + target + " a" ).tab( "show" );
    editor.scrollToLine( line, true, true, function() {} );
    editor.gotoLine( line );
}


function getFilename(path) {
    for (var i = 0; i < fileInfos.length; i++) {
        if (path.indexOf(fileInfos[i].name) != -1) {
            return fileInfos[i].name;
        }
    }
}

function 
assert(condition, message) {
    if (!condition) {
        throw message || ("Assertion Failed.");
    }
}
