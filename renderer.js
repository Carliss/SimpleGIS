const { remote } = require('electron');
const electron = require('electron');
const { ipcRenderer } = electron;
const { Menu, MenuItem } = remote;
const dialog = require('electron').remote.dialog;
const fs = require('fs');
const path = require('path');
const { clipboard } = require('electron');

let t;
let app = new Vue({
    el: '#app',
    data: {
        map: null,  // leflet map
        tileLayer: null, // basemap

        layers: {},  // Holds every layer

        x: 0,  // latitude on mousepointer
        y: 0,  // lonitude on mousepointer

        // list all menu functions, and holds an incremental number for naming
        actions: {
            Point: 0,
            Line: 0,
            Polygon: 0,
        },
        geoprocessing: {
            Buffer: 0,
            Union: 0,
            Difference: 0,
            Intersect: 0,
            Clip: 0,
        },
        geometry: {
            Voronoi: 0,
            Tin: 0,
            Center: 0,
            Translate: 0,
            PointsWithinPolygon: 0,
            LineIntersect: 0,
            ShortestPath: 0,
        },
        analysis: {
            Area: 0,
            Bearing: 0,
            Distance: 0,
            Length: 0,
        },

        projects: [],  // used to store project names
    },
    computed: {
        // represents a store object from the vue object
        store() {
            let vue_store = {
                layers: {},
                actions: {},
                geoprocessing: {},
                geometry: {}
            }
            for (key in this.actions) {
                vue_store.actions[key] = this.actions[key]
            }
            for (key in this.geoprocessing) {
                vue_store.geoprocessing[key] = this.geoprocessing[key]
            }
            for (key in this.geometry) {
                vue_store.geometry[key] = this.geometry[key]
            }
            for (key in this.layers) {
                let layer_temp = {
                    name: this.layers[key].name,
                    data: this.layers[key].data,
                    z: this.layers[key].z,
                    show: this.layers[key].show,
                    style: this.layers[key].style,
                    type: this.layers[key].type,
                }
                vue_store.layers[key] = layer_temp
            }
            return vue_store
        },
        // returns a [long, lat] with 5 decimals, used to convert from leaflets longlat to latlong
        long_lat() {
            return `[${this.y.toFixed(5)}, ${this.x.toFixed(5)}]`
        },
        // returns how many layers there is, used to handle the order of layers on the map
        get_z_range() {
            return Object.keys(this.layers).length;
        },
        // a helper to determine if any layer got a new color so we have to redraw that layer
        layer_colors() {
            return Object.values(this.layers).map(function (v) { return [v.name, v.style.color] });
        },
        layer_names() {
            return Object.keys(this.layers);
        },
        layers_sorted_by_z_descending() {
            let self = this;
            let layers_sorted = []
            for (key of Object.keys(this.layers).sort(function (a, b) { return self.layers[b].z - self.layers[a].z })) {
                let _dict = {}
                _dict[key] = self.layers[key]
                layers_sorted.push(_dict)
            }
            return layers_sorted
        },
        layers_sorted_by_z_ascending() {
            let self = this;
            let layers_sorted = []
            for (key of Object.keys(this.layers).sort(function (a, b) { return self.layers[a].z - self.layers[b].z })) {
                let _dict = {}
                _dict[key] = self.layers[key]
                layers_sorted.push(_dict)
            }
            return layers_sorted
        },
        // returns a "copy" off every layer, used to loose events.
        layers_data() {
            let layers_data = {}
            Object.values(this.layers).forEach(function (l) {
                layers_data[l['name']] = {
                    name: l.name,
                    data: l.data,
                    type: l.type,
                    style: l.style
                }
            })
            return JSON.parse(JSON.stringify(layers_data))
        },
    },
    mounted() {
        // first function to be called after page has loaded
        this.initMap();
    },
    watch: {
        // triggered every time a color of a layer is changed, if a change is noticed
        // the map is redrawned.
        layer_colors: function (n, o) {
            // if no data in layers
            if (Object.keys(this.layers).length === 0) {
                return
            }
            let color_changed = false;
            for (pair of o) {
                let key = pair[0];
                let value = pair[1];
                let layer = this.layers[key] || {}  // if layer was deleted
                if (Object.keys(layer).length && layer.style.color != value) {
                    color_changed = true;
                    this.map.removeLayer(layer.layer)
                    this.layer_create(layer)
                }
            };
            if (color_changed) {
                this.draw_geojson()
            };
        },
    },
    methods: {
        // checks if name change is valid in layers
        checkName({ type, target }) {
            t = target
            if (type == 'change') {
                if (target.id == target.value) {
                    target.className = "layer_name form-control";
                    return
                }
                if (this.layer_names.includes(target.value)) {
                    target.className = "layer_name form-control is-invalid";
                } else {
                    target.className = "layer_name form-control";
                    let old_layer = this.layers[target.id];
                    this.map.removeLayer(old_layer.layer)
                    delete old_layer.layer
                    let layer = JSON.parse(JSON.stringify(old_layer));
                    delete this.layers[target.id]
                    this.layer_create(layer)
                    this.draw_geojson()
                }
            }
        },
        // returns a random hexcolor
        color() {
            return "#" + Math.random().toString(16).slice(2, 8)
        },
        // kinda implemented contextmenu
        test(e) {
            ipcRenderer.send('contextmenu', e)
        },
        // updates the projects names
        store_projects() {
            let projects = []
            let userDataPath = (electron.app || electron.remote.app).getPath('userData');
            fs.readdir(userDataPath, function (err, files) {
                if (err) {
                    return
                }
                files.forEach(function (file) {
                    if (file.startsWith('project_')) {
                        projects.push([file.split('project_')[1].split('.json')[0], file])
                    }
                });
            });
            this.projects = projects
        },
        // loade a project
        store_load(vue) {
            let self = this;
            this.store_projects()
            // remove from map
            this.map.eachLayer(function (layer) {
                self.map.removeLayer(layer);
            });
            // add base map again :)
            this.map.addLayer(this.tileLayer)
            this.tileLayer.bringToBack()

            this.actions = {}
            for (let key in vue.actions) {
                this.$set(this.actions, key, vue.actions[key])
            }
            this.geoprocessing = {}
            for (let key in vue.geoprocessing) {
                this.$set(this.geoprocessing, key, vue.geoprocessing[key])
            }
            this.geometry = {}
            for (let key in vue.geometry) {
                this.$set(this.geometry, key, vue.geometry[key])
            }
            this.layers = {}
            for (let key in vue.layers) {
                this.layer_create(vue.layers[key])
            }
        },
        // save project
        store_save() {
            ipcRenderer.send('store:save', JSON.parse(JSON.stringify(this.store)))
        },
        // create new project
        store_new() {
            ipcRenderer.send('store:project', `project_${Date.now()}.json`)
        },
        // request project to load
        store_load_p(name) {
            ipcRenderer.send('store:project', name)
        },
        // delete project
        store_delete_p(name) {
            ipcRenderer.send('store:delete', name)
        },
        // sace project to spesific location
        store_save_to() {
            var savePath = dialog.showSaveDialog({
                properties: ['openFile'], filters: [{
                    name: 'JSON',
                    extensions: ['json']
                }]
            });
            if (savePath){
                ipcRenderer.send('store:save_to', savePath)
            }
        },
        // load project from 
        store_load_from() {
            let a;
            const filePath = dialog.showOpenDialog({ properties: ['openFile'] });
            if (filePath && filePath.length) {
                try {
                    let project = fs.readFileSync(filePath[0]);
                    a = JSON.parse(project)
                    ipcRenderer.send('store:load', { name: path.basename(filePath[0]), data: a })
                } catch (err) {
                    //throw (err)
                }
            }
        },
        // builds the map
        initMap() {
            this.map = L.map(
                'map', { doubleClickZoom: false, preferCanvas: true }
            ).setView([63.4305, 10.3951], 13);
            this.tileLayer = L.tileLayer(
                'https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png',
                {
                    maxZoom: 20,
                    attribution: '&copy; <a>OpenStreetMap</a>, &copy; <a>CARTO</a>',
                }
            );
            // add base map to map
            this.tileLayer.addTo(this.map);
            // add zoom lvl
            L.control.scale({ imperial: 0 }).addTo(this.map);
            // add event to get coords
            let self = this
            this.map.addEventListener('mousemove', function (ev) {
                self.x = ev.latlng.lat;
                self.y = ev.latlng.lng;
            });
            this.init_map_drawing()
        },
        // add leaflet draw components
        init_map_drawing() {
            let self = this;

            this.map.pm.addControls({
                position: 'topleft',
            });
            // create correct layer
            this.map.on('pm:create', function (e) {
                let layer = {
                    options: {}
                };
                switch (e.shape) {
                    case 'Polygon':
                    case 'Rectangle':
                    case 'Circle':
                        layer['type'] = 'Polygon'
                        layer['name'] = `Polygon_${self.layer_get_next_type_nr('actions', layer['type'])}`
                        break
                    case 'Line':
                        layer['type'] = 'Line'
                        layer['name'] = `Line_${self.layer_get_next_type_nr('actions', layer['type'])}`
                        break
                    case 'Marker':
                        layer['type'] = 'Point'
                        layer['name'] = `Point_${self.layer_get_next_type_nr('actions', layer['type'])}`
                        break
                    default:
                        layer['options']['color'] = self.color()
                }
                // remove layer to create costum layer
                self.map.removeLayer(e.layer)
                let data = e.layer.toGeoJSON();
                //special case if it is a circle, geojson does not have circles
                // we need to convert it to a polygon
                if (e.shape == 'Circle') {
                    data = turf.buffer(data, e.layer.getRadius(), { units: 'meters' })
                }
                layer['data'] = data
                self.layer_create(layer)
            })
            // this.map.on('pm:drawend', function (e) {
            // })
            // delete the actual layer
            this.map.on('pm:remove', function (e) {
                let name = Object.entries(self.layers).filter(function (ent) {
                    if (ent[1].layer._leaflet_id - 1 == e.layer._leaflet_id) {
                        return 1
                    }
                }).map((a) => (a[0]))
                if (name.length) {
                    self.layer_delete(name[0])
                }
            })
        },
        // go thrugh every layer and draw it on the map in the correct order by z
        draw_geojson() {
            for (layer of this.layers_sorted_by_z_ascending) {
                let key = Object.keys(layer)[0]
                let show = Object.values(layer)[0].show
                switch (show) {
                    case false:
                        this.layer_remove(key)
                        break;
                    case true:
                        this.layer_add(key);
                        break;
                    default:
                        alert('draw_geojson: ERRORswitch', key)
                        break;
                }
            }
        },
        /** 
         * Side pannel
         **/

        /** SETTINGS */
        // change from regular crs to simple and the other way around
        set_projection(type) {
            if (type == 'EPSG3857') {
                this.map.options.minZoom = undefined;
                this.map.options.maxZoom = undefined;
                this.map.options.crs = L.CRS.EPSG3857;
                this.map.setView([63.4305, 10.3951], 13);
            } else if (type == 'Simple') {
                this.map.options.crs = L.CRS.Simple;
                this.map.options.minZoom = 0;
                this.map.options.maxZoom = 5;
                this.map.setView([0, 0], 1);
            }
        },
        // good viraity of different basemaps to select from
        set_base_map(service, name) {
            this.map.removeLayer(this.tileLayer)
            if (service == 'google') {
                // LICENCE: https://developers.google.com/maps/terms
                // https://www.google.com/intl/no-NO_US/help/terms_maps/
                google_maps_api = {
                    streets: 'http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
                    hybrid: 'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                    satellite: 'http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                    terrain: 'http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
                }
                this.tileLayer = L.tileLayer(
                    google_maps_api[name],
                    {
                        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                        maxZoom: 20,
                        attribution: '&copy; <a>Google</a>',
                    }
                );
            } else if (service == 'cartodb') {
                // https://carto.com/attribution
                this.tileLayer = L.tileLayer(
                    `https://{s}.basemaps.cartocdn.com/rastertiles/${name}/{z}/{x}/{y}.png`,
                    {
                        maxZoom: 20,
                        attribution: '&copy; <a>CARTO</a>',
                    }
                );

            } else if (service == 'watercollor') {
                // http://creativecommons.org/licenses/by/3.0
                // http://stamen.com
                // https://www.openstreetmap.org/copyright
                this.tileLayer = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.{ext}', {
                    attribution: 'Map tiles by <a>Stamen Design</a>, <a>CC BY 3.0</a> &mdash; Map data &copy; <a>OpenStreetMap</a> contributors',
                    subdomains: 'abcd',
                    minZoom: 1,
                    maxZoom: 20,
                    ext: 'jpg'
                });
            } else if (service == 'tonerlite') {
                // http://creativecommons.org/licenses/by/3.0
                // http://stamen.com
                // https://www.openstreetmap.org/copyright
                this.tileLayer = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}{r}.{ext}', {
                    attribution: 'Map tiles by <a>Stamen Design</a>, <a>CC BY 3.0</a> &mdash; Map data &copy; <a>OpenStreetMap</a> contributors',
                    subdomains: 'abcd',
                    minZoom: 1,
                    maxZoom: 20,
                    ext: 'png'
                });
            } else if (service == 'terrain') {
                // http://creativecommons.org/licenses/by/3.0
                // http://stamen.com
                // https://www.openstreetmap.org/copyright
                this.tileLayer = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}{r}.{ext}', {
                    attribution: 'Map tiles by <a>Stamen Design</a>, <a>CC BY 3.0</a> &mdash; Map data &copy; <a>OpenStreetMap</a> contributors',
                    subdomains: 'abcd',
                    minZoom: 1,
                    maxZoom: 20,
                    ext: 'png'
                });
            }
            this.tileLayer.addTo(this.map);
            this.tileLayer.bringToBack()
        },

        // remove base map
        remove_basemap() {
            this.map.removeLayer(this.tileLayer)
        },

        // upload base image
        upload_base_image() {
            const filePath = dialog.showOpenDialog({ properties: ['openFile'] });
            if (filePath && filePath.length) {
                try {
                    let imag_path = filePath[0]
                    let imagebounds = [[90, -90], [-90, 90]]
                    // remove old base map
                    this.map.removeLayer(this.tileLayer)
                    this.tileLayer = L.imageOverlay(imag_path, imagebounds).addTo(this.map);
                    this.map.setView([90 / 2, 90 / 2], 0)
                } catch (err) {
                    //throw (err);
                }
            }
        },

        /** ACTIONS 
         * opens the different windows
        */
        create_open(type, coords = null) {
            ipcRenderer.send('create:open', {
                type: type,
                layers: this.layers_data,
                color: this.color(),
                name: type + '_' + this.layer_get_next_type_nr('actions', type),
                coords: coords,
            });
        },
        geoprocessing_open(type, coords = null) {
            ipcRenderer.send('geoprocessing:open', {
                type: type,
                layers: this.layers_data,
                color: this.color(),
                name: type + '_' + this.layer_get_next_type_nr('geoprocessing', type),
                coords: coords,
            });
        },
        geometry_open(type, coords = null) {
            ipcRenderer.send('geometry:open', {
                type: type,
                layers: this.layers_data,
                color: this.color(),
                name: type + '_' + this.layer_get_next_type_nr('geometry', type),
                coords: coords,
            });
        },
        analysis_open(type, coords = null) {
            ipcRenderer.send('analysis:open', {
                type: type,
                layers: this.layers_data,
                coords: coords,
            });
        },
        /** LAYER  */

        // base function to create a layer
        layer_create(layer) {
            let big_file = layer.big || false;
            let self = this;
            let data = layer.data || false
            let name = layer.name
            let style = layer.style || { color: this.color() }
            let show = typeof layer.show == 'boolean' ? layer.show : true
            let _layer = L.geoJSON(data,
                {
                    pointToLayer: function (feature, latlng) {
                        return new L.circleMarker(latlng, {
                            radius: style.radius || 5,
                            fillColor: style.color,
                            color: "#000",
                            weight: 1,
                            opacity: style.opacity || 1,
                            fillOpacity: style.opacity ? style.opacity - 0.2 : 0.8
                        }
                        );
                    },
                    onEachFeature: function (feature, inner_layer) {
                        // does this feature have a property named popupContent?
                        if (feature.properties && feature.properties.popupContent) {
                            inner_layer.bindPopup(feature.properties.popupContent);
                        }
                        // layer.bindTooltip(JSON.stringify(feature.properties), {
                        //     className: 'tooltip',
                        // })

                    },
                    style: function (feature) {
                        feature.properties.layer_name = name
                        feature.properties.color = style.color;
                        if (feature.geometry.type == "Point") {
                            // i want circles instead of markers
                            return
                        } else if (feature.properties.a) {
                            // TODO: fix shadowing in dealnoy
                            let f = feature.properties;
                            return {
                                color: 'rgb(' + f.a + ',' + f.b + ',' + f.c + ')'
                            }

                        }
                        return feature.properties;
                    },

                }
            )
            if (!big_file) {
                _layer.pm.enable();
                _layer.on('pm:edit', function (e) {
                    // called on edit and draw
                    let layer_name = e.sourceTarget.feature.properties.layer_name
                    let layer = self.layers[layer_name];
                    self.layer_remove(layer_name)
                    if (e.target) {  // created layer from edit or drag
                        layer['data'] = e.target.toGeoJSON().features[0]
                    } else {  // Some changes may result in remove all data
                        layer['data'] = false;  // set "empty" data, will not be drawn to map
                    }
                    layer['show'] = true;  // set show to true after it was set to false in layer_remove
                    self.layer_create(layer)
                });

                // // event listener on draged, dont need this since edit is called in parrallell
                // inner_layer.on('pm:dragend', function (e) {
                //     console.log('dragend', e)
                // });

                _layer.on('pm:cut', function (e) {
                    let layer_name = e.originalLayer.feature.properties.layer_name  // get layer name 
                    self.map.removeLayer(e.layer)  // remove clip layer
                    let layer = self.layers[layer_name];  // get current layer
                    self.layer_delete(layer_name)  // delete layer to update data
                    if (e.layer.pm._layers[0]) {  // created layer from edit or drag
                        layer['data'] = e.layer.pm._layers[0].toGeoJSON()  // set cutted data as current data
                    } else {  // Some changes may result in remove all data
                        layer['data'] = false;  // set "empty" data, will not be drawn to map
                    }
                    layer['show'] = true;  // set show to true after it was set to false in layer_delete
                    self.layer_create(layer)  // create the new layer with the updated cut
                });
            } else {
                _layer.pm.disable();
            }
            if (show) {
                _layer.addTo(this.map)
            }
            let value = {
                'name': name,
                'layer': _layer,
                'show': show,
                'z': layer.z || this.get_z_range + 1,  // sets the layer order
                'style': style,
                'data': data,
                'type': data ? turf.getType(data) : 'empty',
            }
            this.$set(this.layers, name, value)
            return name
        },

        // delete layer
        layer_delete(layer_name) {
            this.layer_remove(layer_name)
            let current_z = this.layers[layer_name].z
            this.$delete(this.layers, layer_name)
            for (let key in this.layers) {
                if (this.layers[key].z > current_z) {
                    this.layers[key].z -= 1
                }
            }
        },
        // remove and add a fresh layer to the map
        layer_add(name) {
            this.layer_remove(name, true);  // javascript
            let layer = this.layers[name].layer
            if (!this.map.hasLayer(layer)) {
                this.map.addLayer(layer);
            }
            this.$set(this.layers[name], 'show', true)
        },
        // remove layer
        layer_remove(name, quite = false) {
            let layer = this.layers[name].layer
            if (this.map.hasLayer(layer)) {
                this.map.removeLayer(layer)
            }
            this.$set(this.layers[name], 'show', false)
        },

        // return the next count of a specifik action, e.g buffer
        layer_get_next_type_nr(what, type) {
            let nr = ++this[what][type]
            while (this.layer_names.includes(`${type}_${nr}`)) {
                nr = ++this[what][type]
            }
            return nr
        },

        // push a layer up
        layer_push_up(name) {
            let self = this;
            let layer = this.layers[name];
            let layer_z = layer.z
            // hack, instead of reruning filter, if we got match we can execute code :)
            this.layers_sorted_by_z_descending.filter(function (l) {
                if (self.layers[Object.keys(l)[0]].z == layer_z + 1) {
                    self.layers[Object.keys(l)[0]].z -= 1
                    self.layers[name].z += 1
                    self.draw_geojson()
                    return true
                }
                return false
            })
        },
        // push a layer down
        layer_push_down(name) {
            let self = this;
            let layer = this.layers[name];
            let layer_z = layer.z
            // hack, instead of reruning filter, if we got match we can execute code :)
            this.layers_sorted_by_z_descending.filter(function (l) {
                if (self.layers[Object.keys(l)[0]].z == layer_z - 1) {
                    self.layers[Object.keys(l)[0]].z += 1
                    self.layers[name].z -= 1
                    self.draw_geojson()
                    return true
                }
                return false
            })
        },
        // zoom a layer by flying from current zoom and location to the bbox of the layer
        zoom_too_layer(layer_name) {
            this.map.flyToBounds(this.layers[layer_name].layer.getBounds())
        },
        // TODO:
        upload() {
            let a;
            const filePath = dialog.showOpenDialog({ properties: ['openFile'] });
            if (filePath && filePath.length) {
                try {
                    var geo = fs.readFileSync(filePath[0]);
                    a = JSON.parse(geo)

                    var extension = path.extname(filePath[0]);
                    let layer = {
                        data: a,
                        name: path.basename(filePath[0], extension),
                        big: geo.length > 50000 ? true : false,
                    }
                    this.layer_create(layer)
                } catch (err) {
                }
            }
        },
        // copy map coords to clipboard
        map_copy_chords() {
            let text = this.long_lat
            clipboard.writeText(text.toString())
        }
    },
});

/**
 * 
 * MENUS
 */

function get_menu(layer_name) {
    let menu = new Menu()
    menu.append(new MenuItem({
        label: 'Zoom To Layer', click() {
            app.zoom_too_layer(layer_name)
        }
    }))
    menu.append(new MenuItem({
        label: 'Show Data', click() {
            ipcRenderer.send('data:open', JSON.stringify(app.$data.layers[layer_name].data, null, 4));
        }
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
        label: 'Save Data to..', click() {
            let savePath = dialog.showSaveDialog({
                properties: ['openFile'], filters: [{
                    name: 'JSON',
                    extensions: ['json']
                }]
            });
            if (savePath) {
                fs.writeFileSync(savePath, JSON.stringify(app.$data.layers[layer_name].data, null, 4));
            }
        }
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
        label: 'Delete Layer', click() {
            app.layer_delete(layer_name)
        }
    }))
    return menu
}
function get_menu_map(layer_name) {
    let menu = new Menu()
    menu.append(new MenuItem({
        label: 'Create Point', click() {
            app.create_open('Point', app.long_lat)
        }
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ label: 'Copy coords', click() { app.map_copy_chords() } }))
    return menu
}
window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    let id = e.srcElement.id
    if (id == 'map' || e.srcElement.className == 'leaflet-zoom-animated') {
        get_menu_map().popup({ window: remote.getCurrentWindow() })
    } else {
        get_menu(id).popup({ window: remote.getCurrentWindow() })
    }
}, false)

/**
 * IPC
 */

ipcRenderer.on('add_layer', function (e, properties) {
    app.layer_create(properties.layer);
});
ipcRenderer.on('store:state', function (e, vue) {
    app.store_load(vue);
});
ipcRenderer.on('store:update', function (e) {
    app.store_projects()
});



/**
 * CONTROL SAVE LISTENER
 */
var isCtrl = false;
document.onkeyup = function (e) {
    if (e.keyCode == 17 || e.keyCode == 91) isCtrl = false;
}
document.onkeydown = function (e) {
    if (e.keyCode == 17 || e.keyCode == 91) isCtrl = true;
    if (e.keyCode == 83 && isCtrl == true) {
        app.store_save()
    }
}