/*global describe it before after  =*/

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    architect.resolveConfig([
        {
            packagePath : "plugins/c9.core/c9",
            workspaceId : "ubuntu/ip-10-35-77-180",
            startdate   : new Date(),
            debug       : true,
            smithIo     : "{\"prefix\":\"/smith.io/server\"}",
            hosted      : true,
            local       : false,
            hostname    : "dev.javruben.c9.io",
            davPrefix   : "/"
        },
        
        "plugins/c9.core/ext",
        "plugins/c9.core/events",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.ide.ui/lib_apf",
        {
            packagePath : "plugins/c9.core/settings",
            settings : "<settings><state><console>" + JSON.stringify({
                type  : "tab", 
                nodes : [
                    {
                        type : "page",
                        editorType : "output",
                        document : { title : "Output" },
                        active : "true"
                    },
                    {
                        type : "page",
                        editorType : "output",
                        document : {
                            title : "Output2",
                            "output" : {
                                id : "output2"
                            }
                        }
                    }
                ]
            }) + "</console></state></settings>"
        },
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        "plugins/c9.ide.editors/document",
        "plugins/c9.ide.editors/undomanager",
        "plugins/c9.ide.editors/editors",
        "plugins/c9.ide.editors/editor",
        {
            packagePath : "plugins/c9.ide.editors/tabs",
            testing     : 2
        },
        "plugins/c9.ide.editors/tab",
        "plugins/c9.ide.editors/page",
        "plugins/c9.ide.terminal/terminal",
        "plugins/c9.ide.run/output",
        "plugins/c9.ide.console/console",
        "plugins/c9.fs/proc",
        "plugins/c9.fs/fs",
        {
            packagePath: "plugins/c9.vfs.client/vfs_client",
            smithIo     : {
                "prefix": "/smith.io/server"
            }
        },
        "plugins/c9.ide.auth/auth",
        {
            packagePath : "plugins/c9.ide.run/run",
            testing     : true,
            base        : baseProc,
            runners     : {
                "node" : {
                    "caption" : "Node.js (current)",
                    "cmd": ["node", "${debug?--debug-brk=15454}", "$file"],
                    "debugger": "v8",
                    "debugport": 15454,
                    "file_regex": "^[ ]*File \"(...*?)\", line ([0-9]*)",
                    "selector": "source.js",
                    "info": "Your code is running at \\033[01;34m$hostname\\033[00m.\n"
                        + "\\033[01;31mImportant:\\033[00m use \\033[01;32mprocess.env.PORT\\033[00m as the port and \\033[01;32mprocess.env.IP\\033[00m as the host in your scripts!\n"
                },
                "pythoni" : {
                    "caption" : "Python in interactive mode",
                    "cmd": ["python", "-i"],
                    "selector": "source.python",
                    "info": "Hit \\033[01;34mCtrl-D\\033[00m to exit.\n"
                }
            }
        },
        
        // Mock plugins
        {
            consumes : ["emitter", "apf", "ui"],
            provides : [
                "commands", "menus", "layout", "watcher", 
                "save", "fs", "preferences", "anims", "clipboard"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["run", "proc", "fs", "tabs", "console", "output"],
            provides : [],
            setup    : main
        }
    ], function (err, config) {
        if (err) throw err;
        var app = architect.createApp(config);
        app.on("service", function(name, plugin){ plugin.name = name; });
    });
    
    function main(options, imports, register) {
        var run      = imports.run;
        var proc     = imports.proc;
        var fs       = imports.fs;
        var tabs     = imports.tabs;
        var cnsl     = imports.console;
        
        expect.html.setConstructor(function(page){
            if (typeof page == "object")
                return page.tab.aml.getPage("editor::" + page.editorType).$ext;
        });
        
        function countEvents(count, expected, done){
            if (count == expected) 
                done();
            else
                throw new Error("Wrong Event Count: "
                    + count + " of " + expected);
        }
        
        describe('run', function() {
            before(function(done){
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);

                bar.$ext.style.background = "rgba(220, 220, 220, 0.93)";
                bar.$ext.style.position = "fixed";
                bar.$ext.style.left = "20px";
                bar.$ext.style.right = "20px";
                bar.$ext.style.bottom = "20px";
                bar.$ext.style.height = "150px";
      
                document.body.style.marginBottom = "150px";
                done();
            });
            
            describe("listRunners()", function(){
                it('should list all runners', function(done) {
                    run.listRunners(function(err, runners){
                        if (err) throw err.message;
                        
                        expect(runners).length.gt(0);
                        done();
                    })
                });
            });
            
            describe("getRunner()", function(){
                it('should retrieve the runner of a certain type', function(done) {
                    run.getRunner("node", false, function(err, runner){
                        if (err) throw err.message;
                        
                        expect(runner).to.ok;
                        done();
                    })
                });
            });
            
            describe("run()", function(){
                this.timeout(10000);
                
                it('should run a file with a runner', function(done) {
                    var foundPid, count = 0;
                    
                    run.getRunner("node", false, function(err, runner){
                        if (err) throw err.message;
                        
                        expect(runner).to.ok;
                        
                        var c = "console.log('Hello World', new Date());";
                        
                        fs.writeFile("/helloworld.js", c, "utf8", function(err){
                            if (err) throw err.message;
                            
                            var process = run.run(runner, {
                                path: "/helloworld.js"
                            }, function(err, pid){
                                if (err) throw err.message;

                                expect(parseInt(pid, 10))
                                    .to.ok;
                                expect(process.running).to.not.equal(run.STARTING);

                                foundPid = true;
                            });
                            
                            expect(process.running).to.equal(run.STARTING);
                            
                            function c2(){ count++; }
                            process.on("started", c2);
                            process.on("stopping", c2);
                            
                            process.on("stopped", function c1(){
                                expect(process.running).is.equal(run.STOPPED);
                                expect(foundPid, "found-pid").to.ok;
                                
                                process.off("started", c2);
                                process.off("stopping", c2);
                                process.off("stopped", c1);
                                count++;
                                
                                setTimeout(function(){
                                    expect.html(tabs.focussedPage, "Output Mismatch")
                                        .text(/Hello\sWorld/);
                                    
                                    fs.rmfile("/helloworld.js", function(){
                                        countEvents(count, 3, done);
                                    });
                                }, 500);
                            });
                            
                            //expect(process.running).to.equal(run.STOPPED);
                        });
                    });
                });
                
                it('should run a file with a runner and stop it with stop()', function(done) {
                    var count = 0;
                    
                    run.getRunner("node", false, function(err, runner){
                        if (err) throw err.message;
                        
                        expect(runner).to.ok;
                        
                        var c = "setInterval(function(){console.log('Hello World', new Date());}, 500)";
                        
                        fs.writeFile("/helloworld.js", c, "utf8", function(err){
                            if (err) throw err.message;
                            
                            var process = run.run(runner, {
                                path: "/helloworld.js"
                            }, function(err, pid){
                                if (err) throw err.message;
                                
                                expect(parseInt(pid, 10), "Invalid PID").to.ok.to.gt(0);
                                expect(process.running).to.equal(run.STARTED);
                                
                                setTimeout(function(){
                                    process.stop(function(err, e){
                                        if (err) throw err.message;
                                    });
                                }, 1000);
                            });
                            
                            expect(process.running).to.equal(run.STARTING);
                            
                            function c2(){ count++; }
                            process.on("started", c2);
                            process.on("stopping", c2);
                            
                            process.on("stopped", function c1(){
                                expect(process.running).is.equal(run.STOPPED);
                                
                                process.off("started", c2);
                                process.off("stopping", c2);
                                process.off("stopped", c1);
                                count++;
                                
                                setTimeout(function(){
                                    expect.html(tabs.focussedPage, "Output Mismatch")
                                        .text(/Hello\sWorld[\s\S]*Hello\sWorld/);
                                    
                                    fs.rmfile("/helloworld.js", function(){
                                        countEvents(count, 3, done);
                                    });
                                }, 500);
                            });
                        });
                    });
                });
                
                it('should run an interactive proces in the second output window', function(done) {
                    var count = 0;
                    
                    var outputPage2 = tabs.getPages()[1];
                    tabs.focusPage(outputPage2);
                    
                    run.getRunner("pythoni", false, function(err, runner){
                        if (err) throw err.message;
                        
                        expect(runner).to.ok;
                        
                        var process = run.run(runner, {}, "output2", function(err, pid){
                            if (err) throw err.message;
                            
                            expect(parseInt(pid, 10)).to.ok.to.gt(0);
                            expect(process.running).to.equal(run.STARTED);
                            
                            setTimeout(function(){
                                var output = outputPage2.editor;
                                
                                output.write("print 1\n");
                                
                                setTimeout(function(){
                                    output.write(String.fromCharCode(4));
                                }, 1000);
                            }, 1000);
                        });
                        
                        function c2(){ count++; }
                        process.on("started", c2);
                        process.on("stopping", c2);
                        
                        process.on("stopped", function c1(){
                            expect(process.running).is.equal(run.STOPPED);
                            
                            process.off("started", c2);
                            process.off("stopping", c2);
                            process.off("stopped", c1);
                            
                            setTimeout(function(){
                                expect.html(tabs.focussedPage, "Output Mismatch")
                                    .text(/Python/);
                                
                                count++;
                                countEvents(count, 3, done);
                            }, 1000);
                        });
                        
                        expect(process.running).to.equal(run.STARTING);
                    })
                });
                
                it('should run a file with a runner automatically selected in the second output window', function(done) {
                    var foundPid, count = 0;
                    
                    var outputPage2 = tabs.getPages()[1];
                    tabs.focusPage(outputPage2);
                    
                    run.getRunner("node", false, function(err, runner){
                        if (err) throw err.message;
                        
                        expect(runner).to.ok;
                        
                        var c = "console.log('Hello World', new Date());";
                        
                        fs.writeFile("/helloworld.js", c, "utf8", function(err){
                            if (err) throw err.message;
                            var process = run.run("auto", {
                                path: "/helloworld.js"
                            }, "output2", function(err, pid){
                                if (err) throw err.message;

                                expect(parseInt(pid, 10))
                                    .to.ok;
                                expect(process.running).to.not.equal(run.STARTING);

                                foundPid = true;
                            });
                            
                            expect(process.running).to.equal(run.STARTING);
                            
                            function c2(){ count++; }
                            process.on("started", c2);
                            process.on("stopping", c2);
                            
                            process.on("stopped", function c1(){
                                expect(process.running).is.equal(run.STOPPED);
                                expect(foundPid, "found-pid").to.ok;
                                
                                process.off("started", c2);
                                process.off("stopping", c2);
                                process.off("stopped", c1);
                                count++;

                                setTimeout(function(){
                                    expect.html(tabs.focussedPage, "Output Mismatch")
                                        .text(/Hello\sWorld/);
                                    
                                    fs.rmfile("/helloworld.js", function(){
                                        countEvents(count, 3, done);
                                    });
                                }, 1000);                                
                            });
                        });
                    });
                });
            });
            
            if (!onload.remain){
               after(function(done){
                    run.unload();
                    tabs.unload();
                    cnsl.unload();
                   
                   document.body.style.marginBottom = "";
                   done();
               });
            }
        });
        
        onload && onload();
    }
});