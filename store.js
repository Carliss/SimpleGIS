const electron = require('electron');
const path = require('path');
const fs = require('fs');

// functions as a interfase for I/O 
class Store {
    constructor(opts) {
        this.opts = opts
        this.defaults = opts.defaults
        // app.getPath('userData') will return a string of the user's app data directory path.
        this.userDataPath = (electron.app || electron.remote.app).getPath('userData');
        // We'll use the `configName` property to set the file name and path.join to bring it all together as a string
        this.set_project(opts.configName)
    }
    // set project name and project data
    set_project(project) {
        this.path = path.join(this.userDataPath, project);
        try {
            // read project data
            this.data = parseDataFile(this.path);
        } catch (err){
            // if error set it to null
            this.data = null;
        }
        // if data is null set it to the defaults
        if (!this.data) {
            this.data = this.defaults
            // fs.writeFileSync(this.path, JSON.stringify(this.defaults));
        }
    }
    // load project
    load_project(project_name, project_data) {
        this.data = project_data
        this.path = path.join(this.userDataPath, project_name);
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }
    // delete project
    delete_project(project_name) {
        fs.unlinkSync(path.join(this.userDataPath, project_name));
    }
    // get specifik data from store
    get(project, key) {
        this.set_project(project)
        return this.data[key];
    }

    // set specifik data to store
    set(project, key, val) {
        this.set_project(project)
        this.data[key] = val;
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }
    // save to a specifik path
    save_to(path) {
        fs.writeFileSync(path, JSON.stringify(this.data));
    }
}

function parseDataFile(filePath) {
    // We'll try/catch it in case the file doesn't exist yet, which will be the case on the first application run.
    // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object
    try {
        return JSON.parse(fs.readFileSync(filePath));
    } catch (error) {
        // if there was some kind of error, return the passed in defaults instead.
        return false;
    }
}

// expose the class
module.exports = Store;