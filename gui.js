/**
 * Node Runner Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

// @todo skipped this one until more of its dependencies are refactored
// remember to - ask bas what feature he missed.
define(function(require, module, exports) {
    main.consumes = [
        "c9", "plugin", "run", "settings", "menus", "save", 
        "tabbehavior", "ace", "commands", "layout", "tabs", "preferences", 
        "ui", "fs", "layout", "output", "debugger", "tree"
    ];
    main.provides = ["rungui"];
    return main;

    function main(options, imports, register) {
        var Plugin      = imports.plugin;
        var settings    = imports.settings;
        var menus       = imports.menus;
        var commands    = imports.commands;
        var run         = imports.run;
        var c9          = imports.c9;
        var ui          = imports.ui;
        var fs          = imports.fs;
        var layout      = imports.layout;
        var save        = imports.save;
        var tree        = imports.tree;
        var tabs        = imports.tabs;
        var output      = imports.output;
        var tabbehavior = imports.tabbehavior;
        var debug       = imports.debugger;
        var prefs       = imports.preferences;
        var ace         = imports.ace;
        
        var cssString = require("text!./style.css");
        
        /***** Initialization *****/
        
        var plugin  = new Plugin("Ajax.org", main.consumes);
        var emit    = plugin.getEmitter();
        
        var btnRun, lastRun, process;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Commands
            commands.addCommand({
                name    : "run",
                group   : "Run & Debug",
                "hint"  : "run or debug an application",
                bindKey : { mac: "Option-F5", win: "Alt-F5" },
                exec    : function(){ runNow() }
            }, plugin);
    
            commands.addCommand({
                name    : "stop",
                group   : "Run & Debug",
                "hint"  : "stop a running node program on the server",
                bindKey : { mac: "Shift-F5", win: "Shift-F5" },
                exec    : function(){ stop(function(){}) }
            }, plugin);
    
            commands.addCommand({
                group   : "Run & Debug",
                name    : "runthisfile",
                "hint"  : "run or debug this file (stops the app if running)",
                exec    : function(){ runThisFile() }
            }, plugin);
    
            commands.addCommand({
                group   : "Run & Debug",
                name    : "runthistab",
                "hint"  : "run or debug current file (stops the app if running)",
                exec    : function(){ runThisTab() },
                isAvailable : function(){
                    return tabs.focussedPage && tabs.focussedPage.path;
                }
            }, plugin);
    
            commands.addCommand({
                group   : "Run & Debug",
                name    : "runlast",
                "hint"  : "run or debug the last run file",
                bindKey: { mac: "F5", win: "F5" },
                exec    : function(){ runLastFile() },
                isAvailable : function(){
                    return lastRun ? true : false;
                }
            }, plugin);
            
            // Tree context menu
            // Needs to be hidden in readonly mode
            var itemCtxTreeRunFile = new apf.item({
                id      : "itemCtxTreeRunFile",
                match   : "[file]",
                visible : "{!c9.readonly}",
                command : "runthisfile",
                caption : "Run"
            });
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                menus.addItemToMenu(mnuCtxTree, new apf.divider({
                    visible: "{!c9.readonly}"
                }), 800, plugin);
                menus.addItemToMenu(mnuCtxTree, itemCtxTreeRunFile, 810, plugin);
            });
            
            // Check after state.change
            c9.on("state.change", function(e){
                // @todo consider moving this to the run plugin
                if (itemCtxTreeRunFile)
                    itemCtxTreeRunFile.setAttribute("disabled", !(e.state & c9.PROCESS));
            }, plugin);
            
            // Menus
            var c = 1000;
            var itmRun = menus.addItemByPath("Run/Run", new ui.item({
                isAvailable : function(){
                    var page = tabs.focussedPage;
                    var path = page && page.path;
                    
                    if (process && process.running) {
                        itmRun.setAttribute("caption", "Stop"); 
                        itmRun.setAttribute("command", "stop"); 
                        return true;
                    }
                    else {
                        var runner = path && getRunner(path);
                        if (runner) {
                            itmRun.setAttribute("command", "run"); 
                            itmRun.setAttribute("caption", "Run " 
                                + fs.getFilename(path) + " with "
                                + runner.caption);
                            return true;
                        }
                        else {
                            itmRun.setAttribute("command", "run"); 
                            itmRun.setAttribute("caption", "Run");
                        }
                    }
                }
            }), c += 100, plugin);
            var itmRunLast = menus.addItemByPath("Run/Run Last", new ui.item({
                command     : "runlast",
                isAvailable : function(){
                    if (process && process.running || !lastRun) {
                        itmRunLast.setAttribute("caption", "Run Last");
                        return false;
                    }
                    else {
                        var runner = lastRun[0] == "auto"
                            ? getRunner(lastRun[1])
                            : lastRun[0];
                        
                        itmRunLast.setAttribute("caption", "Run Last ("
                            + fs.getFilename(lastRun[1]) + ", " 
                            + (runner.caption || "auto") + ")");
                        return true;
                    }
                }
            }), c += 100, plugin);
            menus.addItemByPath("Run/Show Output Window", new ui.item({
                command: "showoutput"
            }), c += 100, plugin);
            menus.addItemByPath("Run/~", new ui.divider(), c += 100, plugin);
            
            menus.addItemByPath("Run/Run in Debug Mode", new ui.item({
                type    : "check",
                checked : "[{settings.model}::user/runconfig/@debug]"
            }), c += 100, plugin);
            menus.addItemByPath("Run/Enable Source Maps", new ui.item({
                type    : "check",
                checked : "[{settings.model}::project/debug/@sourcemaps]"
            }), c += 100, plugin);
            menus.addItemByPath("Run/Show Debugger at Break", new ui.item({
                type    : "check",
                checked : "[{settings.model}::user/debug/@autoshow]"
            }), c += 100, plugin);
            menus.addItemByPath("Run/Show Output at Run", new ui.item({
                type    : "check",
                checked : "[{settings.model}::user/runconfig/@showconsole]"
            }), c += 100, plugin);
            
            menus.addItemByPath("Run/~", new ui.divider(), c += 100, plugin);
            
            var mnuRunAs = new ui.menu({
                "onprop.visible": function(e){
                    if (e.value) {
                        run.listRunners(function(err, names){
                            var nodes = mnuRunAs.childNodes;
                            for (var i = nodes.length - 3; i >= 0; i--) {
                                mnuRunAs.removeChild(nodes[i]);
                            }
                            
                            var c = 300;
                            names.forEach(function(name){
                                menus.addItemToMenu(mnuRunAs, new ui.item({
                                    caption  : name.uCaseFirst(),
                                    value    : name
                                }), c++, plugin);
                            });
                        });
                    }
                },
                "onitemclick": function(e){
                    if (e.value == "new-run-system") {
                        tabs.open({
                            path   : settings.get("project/run/@path") 
                              + "/New Runner",
                            active : true,
                            value  : '{\n'
                              + '    "caption" : "",\n'
                              + '    "cmd" : ["ls"],\n'
                              + '    "hint" : "",\n'
                              + '    "selector": "source.ext"\n'
                              + '}',
                            document : {
                                meta : {
                                    newfile: true
                                },
                                ace : {
                                    customType : "json"
                                }
                            }
                        }, function(){});
                        return;
                    }
                    
                    run.getRunner(e.value, function(err, runner){
                        if (err)
                            return layout.showError(err);
                        
                        runNow(runner);
                    });
                    
                    settings.set("project/build/@builder", e.value);
                }
            });
            
            menus.addItemByPath("Run/Run With/", mnuRunAs, 
                c += 100, plugin);
            menus.addItemByPath("Run/Run History/", new ui.item({
                isAvailable : function(){ return false; }
            }), c += 100, plugin);
            menus.addItemByPath("Run/~", new ui.divider(), c += 100, plugin);
            
            menus.addItemByPath("Run/Run Configurations", new ui.item({
                isAvailable : function(){ return false; }
            }), c += 100, plugin);
            
            c = 0;
            menus.addItemByPath("Run/Run With/~", new ui.divider(), c += 1000, plugin);
            menus.addItemByPath("Run/Run With/New Runner", new ui.item({
                value : "new-run-system"
            }), c += 100, plugin);
            
            // Other Menus
            
            var itmRunFile1 = new apf.item({ command : "runthistab" });
            var itmRunFile2 = new apf.item({ command : "runthistab" });
            
            menus.addItemByPath("View/Tabs/Run This File", itmRunFile1, 400, plugin);
            menus.addItemByPath("View/Tabs/~", new apf.divider(), 300, plugin)
    
            tabbehavior.getElement("mnuContextTabs", function(mnuContextTabs){
                menus.addItemByPath("~", new apf.divider(), 800, mnuContextTabs, plugin);
                menus.addItemByPath("Run This File", itmRunFile2, 850, mnuContextTabs, plugin);
            });
            
            // Draw
            draw();
            
            // Hooks
            function updateRunFile(){
                itmRunFile1.setAttribute("disable", !tabs.focussedPage ||
                    !tabs.focussedPage.path || !process || !process.running);
                itmRunFile2.setAttribute("disable", !tabs.focussedPage ||
                    !tabs.focussedPage.path || !process || !process.running);
            }
            
            // run.on("starting", updateRunFile, plugin);
            // run.on("started", updateRunFile, plugin);
            run.on("stopped", updateRunFile, plugin);
            
            c9.on("state.change", function(e){
                btnRun.setAttribute("disabled", !(e.state & c9.PROCESS));
            }, plugin);
            
            // Preferences
            prefs.add({
                "Run" : {
                    "Run & Debug" : {
                        "Save All Unsaved Tabs Before Running" : {
                           type : "checkbox",
                           path : "user/runconfig/@saveallbeforerun",
                           position : 100
                        }
                    }
                }
            }, plugin);
            
            // settings
            settings.on("read", function(e){
                settings.setDefaults("user/runconfig", [
                    ["saveallbeforerun", "false"],
                    ["debug", "true"],
                    ["showconsole", "true"],
                    ["showruncfglist", "false"]
                ]);
            }, plugin);
    
            tabs.on("focus", function(e){
                updateRunFile();
                
                if (process && process.running)
                    return;
                
                if (e.page.path) {
                    btnRun.enable();
                    btnRun.setAttribute("tooltip", "Run " 
                        + fs.getFilename(e.page.path));
                }
                else {
                    btnRun.disable();
                    btnRun.setAttribute("tooltip", "")
                }
            }, plugin);
            
            tabs.on("page.destroy", function(e){
                updateRunFile();
                
                if (e.last) {
                    btnRun.disable();
                    btnRun.setAttribute("tooltip", "");
                }
            }, plugin);
    
            ace.getElement("menu", function(menu){
                menus.addItemToMenu(menu, new ui.item({
                    caption  : "Run This File",
                    command  : "runthistab",
                }), 800, plugin);
                menus.addItemToMenu(menu, new ui.divider(), 900, plugin);
            });
        };
        
        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;
    
            // Import CSS
            ui.insertCss(cssString, plugin);
            
            // Menus
            btnRun = ui.insertByIndex(layout.findParent(plugin), 
              new ui.button({
                id       : "btnRun",
                skin     : "c9-toolbarbutton-glossy",
                command  : "run",
                caption  : "Run",
                disabled : true,
                icon     : "run.png",
                visible  : "true"
            }), 100, plugin);
            
            emit("draw");
        }
        
        /***** Methods *****/
    
        function getRunner(path){
            var ext = fs.getExtension(path);
            for (var name in run.runners) {
                if (run.runners[name].selector == "source." + ext)
                    return run.runners[name];
            }
            return false;
        }
        
        function runNow(runner, path){
            if (!path) {
                path = tabs.focussedPage && tabs.focussedPage.path;
                if (!path) return;
            }
            
            if (process && process.running)
                stop(done);
            else
                done();
            
            function done(){
                if (!runner)
                    runner = "auto";
                
                if (settings.getBool("user/runconfig/@showconsole")) {
                    commands.exec("showoutput");
                }
                
                var bDebug = settings.getBool("user/runconfig/@debug");
                
                process = run.run(runner, {
                    path  : path,
                    debug : bDebug
                }, function(err, pid){
                    if (err) 
                        return layout.showError(err);
                    
                    if (bDebug) {
                        debug.debug(process.runner[0], function(err){
                            if (err)
                                return; // Either the debugger is not found or paused
                        });
                    }
                });
                
                process.on("stopping", function(){
                    btnRun.disable();
                }, plugin);
                
                process.on("stopped", function(){
                    btnRun.enable();
                    
                    var path = transformButton();
                    
                    if (path)
                        btnRun.enable();
                    else
                        btnRun.disable();
                }, plugin);
                
                transformButton("stop")
            }
            
            lastRun = [runner, path];
        }
        
        function transformButton(to){
            if (to == "stop") {
                btnRun.setAttribute("command", "stop");
                btnRun.setAttribute("icon", "stop.png");
                btnRun.setAttribute("caption", "Stop");
                btnRun.setAttribute("tooltip", "");
                btnRun.setAttribute("class", "running");
                btnRun.enable();
            }
            else {
                var path = tabs.focussedPage && tabs.focussedPage.path;
                    
                btnRun.setAttribute("icon", 
                    btnRun.checked ? "bug.png" : "run.png");
                btnRun.setAttribute("caption", "Run");
                btnRun.setAttribute("tooltip", (path 
                    ? "Run " + fs.getFilename(path)
                    : ""));
                btnRun.setAttribute("class", "stopped");
                btnRun.setAttribute("command", "run");
                
                return path;
            }
        }
        
        function stop(callback) {
            if (process)
                process.stop(function(err){
                    if (err) {
                        layout.showError(err.message || err);
                        transformButton();
                    }
                    
                    debug.stop();
                    
                    callback(err);
                });
        }
        
        function runLastFile(){
            if (lastRun)
                runNow.apply(this, lastRun)
        }
    
        function runThisFile() {
            var file = trFiles.selected;
            var node = this.addConfig(true, file);
    
            this.runConfig(node);
        }
    
        function runThisTab() {
            var file = ide.getActivePageModel();
            var node = this.addConfig(true, file);
    
            this.runConfig(node);
        }
    
        function onHelpClick() {
            var page = "running_and_debugging_code";
            if (ide.infraEnv)
                require("ext/docum" + "entation/documentation").show(page);
            else
                window.open("https://docs.c9.io/" + page + ".html");
        }
    
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * UI for the Run plugin
         */
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            "rungui": plugin
        });
    }
});