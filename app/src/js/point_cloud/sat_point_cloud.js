/* global SatItem THREE */

/**
 * Point Cloud Item
 * @param {Sat} sat: context
 * @param {int} index: index of the point cloud in the sat
 * @param {string} url: URL of the data
 */
function SatPointCloud(sat, index, url) {
    SatItem.call(this, sat, index, url);

    this.wheelListener = this.handleMouseWheel.bind(this);
    this.mouseMoveListener = this.handleMouseMove.bind(this);
    this.mouseDownListener = this.handleMouseDown.bind(this);
    this.mouseUpListener = this.handleMouseUp.bind(this);
    this.keyDownListener = this.handleKeyDown.bind(this);
    this.keyUpListener = this.handleKeyUp.bind(this);
    this.prevItemListener = (function() {
        if (this.index > 0) {
            this.sat.slider.value = this.index - 1;
            this.sat.gotoItem(this.index - 1);
        }
    }).bind(this);
    this.nextItemListener = (function() {
        if (this.index < this.sat.items.length - 1) {
            this.sat.slider.value = this.index + 1;
            this.sat.gotoItem(this.index + 1);
        }
    }).bind(this);
    this.sliderListener = (function() {
        if (this.sat.slider.value != this.index) {
            this.sat.gotoItem(this.sat.slider.value);
        }
    }).bind(this);
    this.addBoxListener = (function() {
        this.addBoundingBox(this.sat.newLabel(), true);
    }).bind(this);

    this.POINT_SIZE = 0.2;

    // Set up letiables for calculating camera movement
    this.quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3( 0, 1, 0 ));
    this.quatInverse = this.quat.clone().inverse();

    this.MOUSE_CORRECTION_FACTOR = 80.0;
    this.MOVE_CORRECTION_FACTOR = 0.3;
    this.VERTICAL = new THREE.Vector3(0, 0, 1);

    this.UP_KEY = 38;
    this.DOWN_KEY = 40;
    this.LEFT_KEY = 37;
    this.RIGHT_KEY = 39;
    this.PERIOD_KEY = 190;
    this.SLASH_KEY = 191;

    this.MOVE_UP = new THREE.Vector3(0, 0, 0.2);
    this.MOVE_DOWN = new THREE.Vector3(0, 0, -0.2);

    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;

    // Rendering
    this.target = new THREE.Vector3();

    this.scene = new THREE.Scene();

    this.container = sat.container;

    this.particles;

    // Set up camera and views
    this.views = [];

    for (let i = 0; i < sat.view_params.length; i++) {
        // Make a copy of the view parameters
        this.views.push({});
        this.views[i]['top'] = sat.view_params[i]['top'];
        this.views[i]['left'] = sat.view_params[i]['left'];
        this.views[i]['width'] = sat.view_params[i]['width'];
        this.views[i]['height'] = sat.view_params[i]['height'];
        this.views[i]['restrictDrag'] = sat.view_params[i]['restrictDrag'];
        this.views[i]['position'] = sat.view_params[i]['position'].clone();

        // Create camera
        let camera = new THREE.PerspectiveCamera(
            75,
            this.container.offsetWidth /
            this.container.offsetHeight,
            0.1, 1000);
        camera.up = this.VERTICAL;
        camera.position.copy(this.views[i].position);
        camera.lookAt(this.target);

        // Initalize rotation parameters
        this.currentCamera = camera;
        this.rotate_restricted(0, 0);
        this.zoom(0);
        this.views[i].camera = camera;
    }
    this.currentView = null;
    this.currentCamera = null;

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(0.03),
        new THREE.MeshBasicMaterial({color:
                0xffffff}));
    this.sphere.position = this.target;
    this.scene.add( this.sphere );

    // Bounding boxes
    this.bounding_boxes = [];
    this.selectedLabel = null;
    this.selectedLabelNewBox = false;

    this.ESCAPE_KEY = 27;
    this.R_KEY = 82;
    this.S_KEY = 83;
    this.E_KEY = 69;
    this.ENTER_KEY = 13;
    this.DELETE_KEY = 8;

    this.STANDBY = 0;
    this.ADJUSTING = 1;
    this.EDITING = 2;

    this.selectionState = this.STANDBY;

    this.MOVING_BOX = 1;
    this.ROTATING_BOX = 2;
    this.SCALING_BOX = 3;
    this.EXTRUDING_BOX = 4;

    this.editState = this.MOVING_BOX;

    this.raycaster = new THREE.Raycaster();
    this.boxMouseOver = null;
    this.boxMouseOverPoint = null;

    this.viewPlaneOffset = new THREE.Vector3();
    this.viewPlaneNormal = new THREE.Vector3();

    this.info_card = document.getElementById('bounding_box_card');
    this.label_list = document.getElementById('label_list');

    // Load point cloud data
    this.getPCJSON();
}

SatPointCloud.prototype = Object.create(SatItem.prototype);

SatPointCloud.prototype.getPCJSON = function() {
    // Get the JSON point cloud from the url
    let req = new XMLHttpRequest();
    req.onreadystatechange = (function() {
        if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
            this.pc_json = req.response;

            // Parse point cloud
            let pcPoints = [].concat(...this.pc_json.points);
            let pcColors = [].concat(...this.pc_json.colors);

            let positions = new Float32Array(pcPoints.length * 3);
            let sizes = new Float32Array(pcPoints.length);
            let colors = new Float32Array(pcPoints.length * 3);

            for (let i = 0; i < pcPoints.length; i++) {
                for (let j = 0; j < 3; j++) {
                    positions[3 * i + j] = pcPoints[i][j];
                    colors[3 * i + j] = pcColors[i][j];
                }
                sizes[i] = this.POINT_SIZE / 2.0;
            }

            let geometry = new THREE.BufferGeometry();
            geometry.addAttribute('position',
                new THREE.BufferAttribute(positions, 3));
            geometry.addAttribute('customColor',
                new THREE.BufferAttribute(colors, 3));
            geometry.addAttribute('size',
                new THREE.BufferAttribute(sizes, 1));

            let material = new THREE.ShaderMaterial({
                uniforms: {
                    color: {
                        value: new THREE.Color(0xffffff),
                    },
                },
                vertexShader:
                document.getElementById('vertexshader').textContent,
                fragmentShader:
                document.getElementById('fragmentshader').textContent,
                alphaTest: 0.9,
            });

            this.particles = new THREE.Points(geometry, material);
            this.scene.add(this.particles);

            this.loaded();
        }
    }).bind(this);

    req.responseType = 'json';
    req.open('GET', this.url);
    req.send();
};

SatPointCloud.prototype.setActive = function(active) {
    if (this.active == active) {
        return;
    }

    if (active) {
        document.getElementById('prev_item').addEventListener('click',
            this.prevItemListener, false);

        document.getElementById('next_item').addEventListener('click',
            this.nextItemListener, false);

        document.getElementById('add_box').addEventListener('click',
            this.addBoxListener, false);

        this.container.addEventListener('wheel',
            this.wheelListener, false);

        this.container.addEventListener('mousemove',
            this.mouseMoveListener, false);

        this.container.addEventListener('mousedown',
            this.mouseDownListener, false);

        this.container.addEventListener('mouseup',
            this.mouseUpListener, false);

        document.addEventListener('keydown',
            this.keyDownListener, false);

        document.addEventListener('keyup',
            this.keyUpListener, false);

        this.label_list.innerHTML = '';

        for (let i = 0; i < this.labels.length; i++) {
            this.addLabelToList(this.labels[i]);
        }
    } else {
        document.getElementById('prev_item').removeEventListener('click',
            this.prevItemListener, false);
        document.getElementById('next_item').removeEventListener('click',
            this.nextItemListener, false);
        document.getElementById('add_box').removeEventListener('click',
            this.addBoxListener, false);
        this.container.removeEventListener('wheel',
            this.wheelListener, false);
        this.container.removeEventListener('mousemove',
            this.mouseMoveListener, false);
        this.container.removeEventListener('mousedown',
            this.mouseDownListener, false);
        this.container.removeEventListener('mouseup',
            this.mouseUpListener, false);
        document.removeEventListener('keydown',
            this.keyDownListener, false);
        document.removeEventListener('keyup',
            this.keyUpListener, false);

        this.deselect();
        this.selectionState = this.STANDBY;
        this.editState = this.MOVING_BOX;
    }
};

SatPointCloud.prototype.redraw = function() {
    for (let i = 0; i < this.views.length; i++) {
        let view = this.views[i];
        let camera = this.views[i].camera;

        let left = Math.floor(this.container.offsetWidth * view.left);
        let top = Math.floor(this.container.offsetHeight * view.top);
        let width = Math.floor(this.container.offsetWidth * view.width);
        let height = Math.floor(this.container.offsetHeight * view.height);

        this.sat.renderer.setViewport(left, top, width, height);
        this.sat.renderer.setScissor(left, top, width, height);
        this.sat.renderer.setScissorTest(true);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        this.sat.renderer.render(this.scene, camera);
    }

    if (this.selectedLabel != null) {
        this.updateRotationInfo();
        this.updatePositionInfo();
        this.updateScaleInfo();
    }

    this.updateViewInfo();
};

SatPointCloud.prototype.zoom = function(amount) {
    let offset = new THREE.Vector3();
    offset.copy(this.currentCamera.position);
    offset.sub(this.target);

    let spherical = new THREE.Spherical();
    spherical.setFromVector3(offset);

    spherical.radius *= 1 - amount;

    offset.setFromSpherical(spherical);

    offset.add(this.target);

    this.currentCamera.position.copy(offset);

    this.currentCamera.lookAt(this.target);
};

SatPointCloud.prototype.handleMouseWheel = function(e) {
    this.zoom(e.deltaY / this.MOUSE_CORRECTION_FACTOR);
};

// Rotate camera about vertical axis and axis orthogonal to vertical axis
// and axis between camera and target
SatPointCloud.prototype.rotate_free = function(dx, dy) {
    let offset = new THREE.Vector3();
    offset.copy(this.currentCamera.position);
    offset.sub(this.target);

    offset.applyQuaternion(this.quat);

    let spherical = new THREE.Spherical();
    spherical.setFromVector3(offset);

    spherical.theta += dx;
    spherical.phi += dy;

    spherical.phi = Math.max(0, Math.min(Math.PI, spherical.phi));

    spherical.makeSafe();

    offset.setFromSpherical(spherical);
    offset.applyQuaternion(this.quatInverse);

    offset.add(this.target);

    this.currentCamera.position.copy(offset);

    this.currentCamera.lookAt(this.target);
};

// Rotate about vertical axis
SatPointCloud.prototype.rotate_restricted = function(dx) {
    let offset = new THREE.Vector3();
    offset.copy(this.currentCamera.position);
    offset.sub(this.target);

    offset.applyQuaternion(this.quat);

    let spherical = new THREE.Spherical();
    spherical.setFromVector3(offset);

    spherical.theta += dx;

    spherical.makeSafe();

    offset.setFromSpherical(spherical);
    offset.applyQuaternion(this.quatInverse);

    offset.add(this.target);

    this.currentCamera.position.copy(offset);

    this.currentCamera.lookAt(this.target);
};

SatPointCloud.prototype.handleMouseMove = function(e) {
    if (this.mouseDown) {
        if (this.selectionState == this.EDITING) {
            switch (this.editState) {
                case this.MOVING_BOX:
                    this.selectedLabel.moveBoxAlongViewPlane(
                        this.viewPlaneNormal, this.viewPlaneOffset,
                        this.boxMouseOverPoint, this.currentCamera.position,
                        this.calculateProjectionFromMouse(e.clientX, e.clientY)
                    );
                    break;
                case this.SCALING_BOX:
                    this.selectedLabel.scaleBox(
                        this.currentCamera.position,
                        this.calculateProjectionFromMouse(e.clientX, e.clientY)
                    );
                    break;
                case this.EXTRUDING_BOX:
                    this.selectedLabel.extrudeBox(
                        this.boxMouseOverPoint,
                        this.currentCamera.position,
                        this.calculateProjectionFromMouse(e.clientX, e.clientY)
                    );
                    break;
                case this.ROTATING_BOX:
                    this.selectedLabel.rotateBox(
                        this.currentCamera.position,
                        this.currentCamera.getWorldDirection(),
                        this.calculateProjectionFromMouse(
                            this.mouseX + this.container.offsetLeft,
                            this.mouseY),
                        this.calculateProjectionFromMouse(e.clientX, e.clientY)
                    );
                    break;
            }
        } else {
            // Rotate when dragging
            let dx = e.clientX - this.container.offsetLeft - this.mouseX;
            let dy = e.clientY - this.mouseY;

            if (this.currentView.restrictDrag) {
                this.rotate_restricted(dx / this.MOUSE_CORRECTION_FACTOR,
                    dy / this.MOUSE_CORRECTION_FACTOR);
            } else {
                this.rotate_free(dx / this.MOUSE_CORRECTION_FACTOR,
                    dy / this.MOUSE_CORRECTION_FACTOR);
            }
        }
    } else {
        // Find view that mouse is currently hovering over
        let x = (e.clientX - this.container.offsetLeft) /
            this.container.offsetWidth;
        let y = e.clientY / this.container.offsetHeight;

        for (let i = 0; i < this.views.length; i++) {
            if (x >= this.views[i].left &&
                x <= this.views[i].left + this.views[i].width &&
                y >= this.views[i].top &&
                y <= this.views[i].top + this.views[i].height) {
                this.currentView = this.views[i];
                this.currentCamera = this.currentView.camera;
                break;
            }
        }

        this.highlightMousedOverBox(e.clientX, e.clientY);
    }

    document.getElementById('mouse').innerHTML =
        '(' + (e.clientX - this.container.offsetLeft).toFixed(2) + ', ' +
        e.clientY.toFixed(2) + ')';

    this.mouseX = e.clientX - this.container.offsetLeft;
    this.mouseY = e.clientY;
};

SatPointCloud.prototype.handleMouseDown = function() {
    this.mouseDown = true;
    if (this.selectionState == this.STANDBY) {
        if (this.boxMouseOver != null) {
            this.select(this.boxMouseOver.label);
        }
    } else if (this.selectionState == this.ADJUSTING) {
        if (this.boxMouseOver != null &&
            this.selectedLabel == this.boxMouseOver.label) {
            this.selectionState = this.EDITING;

            if (this.editState == this.MOVING_BOX) {
                this.viewPlaneNormal.copy(
                    this.currentCamera.position);
                this.viewPlaneNormal.sub(this.target);
                this.viewPlaneNormal.normalize();

                this.viewPlaneOffset.copy(this.selectedLabel.box.position);
                this.viewPlaneOffset.sub(this.boxMouseOverPoint);
            }
        }
    }
};

SatPointCloud.prototype._changeSelectedLabelCategory = function() {
    if (this.selectedLabel != null) {
        let selectorName = 'parent_select_';
        let level = 0;
        let selector = document.getElementById(selectorName + level);

        this.selectedLabel.categoryPath = '';
        while (selector != null) {
            this.selectedLabel.categoryPath +=
                selector.options[selector.selectedIndex].value + ',';
            level++;
            selector = document.getElementById(selectorName + level);
        }

        selector = document.getElementById('category_select');
        this.selectedLabel.name =
            selector.options[selector.selectedIndex].value;
        this.selectedLabel.categoryPath += this.selectedLabel.name;

        for (let i = 0; i < this.label_list.childNodes.length; i++) {
            if (this.label_list.childNodes[i].label == this.selectedLabel) {
                this.label_list.childNodes[i].text = this.selectedLabel.name +
                    ' ' + this.selectedLabel.id;
            }
        }
    }
};

SatPointCloud.prototype.handleMouseUp = function() {
    this.mouseDown = false;
    if (this.selectionState == this.EDITING) {
        this.selectionState = this.ADJUSTING;
        if (this.editState != this.MOVING_BOX) {
            this.selectedLabel.setColor(0xff0000);
        }
        this.editState = this.MOVING_BOX;
    }
};

SatPointCloud.prototype.calculateForward = function() {
    let forward = new THREE.Vector3();
    forward.copy(this.target);
    forward.sub(this.currentCamera.position);
    forward.z = 0;
    forward.normalize();
    forward.multiplyScalar(this.MOVE_CORRECTION_FACTOR);
    return forward;
};

SatPointCloud.prototype.calculateLeft = function(forward) {
    let left = new THREE.Vector3();
    left.crossVectors(this.VERTICAL, forward);
    left.normalize();
    left.multiplyScalar(this.MOVE_CORRECTION_FACTOR);
    return left;
};

SatPointCloud.prototype.handleKeyDown = function(e) {
    let forward = this.calculateForward();
    let left = this.calculateLeft(forward);
    // Move target and camera depending on which key is pressed
    switch (e.keyCode) {
        case this.PERIOD_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.add(this.MOVE_UP);
            }
            this.target.add(this.MOVE_UP);
            this.sphere.position.copy(this.target);
            break;
        case this.SLASH_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.add(this.MOVE_DOWN);
            }
            this.target.add(this.MOVE_DOWN);
            this.sphere.position.copy(this.target);
            break;
        case this.UP_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.add(forward);
            }
            this.target.add(forward);
            this.sphere.position.copy(this.target);
            break;
        case this.DOWN_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.sub(forward);
            }
            this.target.sub(forward);
            this.sphere.position.copy(this.target);
            break;
        case this.LEFT_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.add(left);
            }
            this.target.add(left);
            this.sphere.position.copy(this.target);
            break;
        case this.RIGHT_KEY:
            for (let i = 0; i < this.views.length; i++) {
                this.views[i].camera.position.sub(left);
            }
            this.target.sub(left);
            this.sphere.position.copy(this.target);
            break;
        case this.DELETE_KEY:
            this.selectionState = this.STANDBY;
            this.selectedLabelNewBox = false;
            if (this.selectedLabel) {
                this.deleteSelection();
            }
            break;
        case this.ESCAPE_KEY:
            if (this.selectedLabelNewBox) {
                this.deleteSelection();
                this.selectedLabelNewBox = false;
            }

            this.selectionState = this.STANDBY;
            this.deselect();
            break;
        case this.ENTER_KEY:
            if (this.selectionState == this.ADJUSTING) {
                this.selectedLabelNewBox = false;
                this.selectionState = this.STANDBY;
                this.deselect();
            } else if (this.selectionState == this.STANDBY) {
                if (this.selectedLabel != null) {
                    this.selectionState = this.ADJUSTING;
                }
            }
            break;
        case this.S_KEY:
            if (this.selectionState != this.EDITING) {
                this.editState = this.SCALING_BOX;
            }
            if (this.selectionState == this.ADJUSTING) {
                this.selectedLabel.setColor(0x00ff00, [8, 9, 10, 11]);
            }
            break;
        case this.E_KEY:
            if (this.selectionState != this.EDITING) {
                this.editState = this.EXTRUDING_BOX;
            }
            if (this.selectionState == this.ADJUSTING) {
                this.selectedLabel.setColor(0x00ff00,
                    [0, 1, 2, 3, 4, 5, 6, 7]);
            }
            break;
        case this.R_KEY:
            if (this.selectionState != this.EDITING) {
                this.editState = this.ROTATING_BOX;
            }
    }
};

SatPointCloud.prototype.handleKeyUp = function() {
    if (this.selectionState != this.EDITING) {
        this.editState = this.MOVING_BOX;
    }
    if (this.selectionState == this.ADJUSTING) {
        this.selectedLabel.setColor(0xff0000);
    }
};

SatPointCloud.prototype.addBoundingBox = function(label, select=false) {
    let box = new THREE.Mesh(
        new THREE.BoxGeometry( 1, 1, 1 ),
        new THREE.MeshBasicMaterial({color: 0xffffff,
            vertexColors: THREE.FaceColors,
            transparent: true,
            opacity: 0.5})
    );

    let outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(box.geometry),
        new THREE.LineBasicMaterial({color: 0xffffff}));

    box.outline = outline;
    box.label = label;
    this.bounding_boxes.push(box);

    label.box = box;

    if (label.data) {
        box.position.x = label.data['position'][0];
        box.position.y = label.data['position'][1];
        box.position.z = label.data['position'][2];
        box.outline.position.copy(box.position);

        box.rotation.x = label.data['rotation'][0];
        box.rotation.y = label.data['rotation'][1];
        box.rotation.z = label.data['rotation'][2];
        box.outline.rotation.copy(box.rotation);

        box.scale.x = label.data['scale'][0];
        box.scale.y = label.data['scale'][1];
        box.scale.z = label.data['scale'][2];
        box.outline.scale.copy(box.scale);
    } else {
        box.scale.z = 0.01;

        label.data = {};
        label.data['position'] = [this.target.x, this.target.y,
            this.target.z];
        label.data['rotation'] = [box.rotation.x, box.rotation.y,
            box.rotation.z];
        label.data['scale'] = [box.scale.x, box.scale.y, box.scale.z];

        box.position.copy(this.target);
        box.outline.position.copy(box.position);
        box.outline.scale.copy(box.scale);
    }

    this.addLabelToList(label);

    if (select) {
        this.selectedLabelNewBox = true;
        this.select(label);
        this.selectionState = this.ADJUSTING;
        this._changeSelectedLabelCategory();
    }

    this.scene.add(box);
    this.scene.add(box.outline);
};

SatPointCloud.prototype.updateScaleInfo = function() {
    // Set scale info
    let scale = this.selectedLabel.box.scale;
    this.info_card.querySelector('#box_dimensions').innerHTML =
        '(' + Math.abs(scale.x).toFixed(2) + ', ' +
        Math.abs(scale.y).toFixed(2) + ', ' +
        Math.abs(scale.z).toFixed(2) + ')';
};

SatPointCloud.prototype.updatePositionInfo = function() {
    // Set pos info
    let pos = this.selectedLabel.box.position;
    this.info_card.querySelector('#box_center').innerHTML =
        '(' + pos.x.toFixed(2) + ', ' +
        pos.y.toFixed(2) + ', ' +
        pos.z.toFixed(2) + ')';
};

SatPointCloud.prototype.updateRotationInfo = function() {
    // Set rotation info
    let rot = this.selectedLabel.box.rotation;
    this.info_card.querySelector('#box_rotation').innerHTML =
        '(' + rot.x.toFixed(2) + ', ' +
        rot.y.toFixed(2) + ', ' +
        rot.z.toFixed(2) + ')';
};

SatPointCloud.prototype.updateViewInfo = function() {
    document.getElementById('camera_position').innerHTML = '';
    for (let i = 0; i < this.views.length; i++) {
        let point = this.views[i].camera.position;
        document.getElementById('camera_position').innerHTML +=
            '<p>(' + point.x.toFixed(2) + ', ' + point.y.toFixed(2)
            + ', ' + point.z.toFixed(2) + ')<p>';
    }

    let target = this.target;
    document.getElementById('target').innerHTML =
        '(' + target.x.toFixed(2) + ', ' + target.y.toFixed(2) + ', ' +
        target.z.toFixed(2) + ')';
};

SatPointCloud.prototype.deactivateLabelList = function() {
    for (let j = 0; j < this.label_list.childNodes.length; j++) {
        this.label_list.childNodes[j].classList.remove('active');
    }
};

SatPointCloud.prototype.addLabelToList = function(label) {
    let item = document.createElement('a');
    item.href = '#';

    item.text = label.name + ' ' + label.id;

    item.classList.add('list-group-item');
    item.classList.add('list-group-item-action');

    this.label_list.appendChild(item);

    item.label = label;

    item.addEventListener('click', (function() {
        this.deactivateLabelList();
        if (this.selectionNewBox) {
            this.deleteSelection();
            this.selectionNewBox = false;
        }
        this.selectionState = this.STANDBY;
        this.select(label);
    }).bind(this));
};

SatPointCloud.prototype.select = function(label) {
    let temp = this.selectedLabel;
    this.deselect();

    // If selecting same thing, then only deselect
    if (temp != label) {
        this.selectedLabel = label;
        this.selectedLabel.setColor(0xff0000);

        this.info_card.style.display = 'block';

        // Set category
        this._changeSelectedLabelCategory();

        // Make active in label list
        for (let i = 0; i < this.label_list.childNodes.length; i++) {
            if (this.label_list.childNodes[i].label == label) {
                this.label_list.childNodes[i].classList.add('active');
            }
        }
    }
};

SatPointCloud.prototype.deselect = function() {
    if (this.selectedLabel != null) {
        this.selectedLabel.setColor(0xffffff);
        this.selectedLabel = null;
        this.info_card.style.display = 'none';
        this.deactivateLabelList();
    }
};

SatPointCloud.prototype.deleteSelection = function() {
    this.scene.remove(this.selectedLabel.box.outline);
    this.scene.remove(this.selectedLabel.box);
    this.bounding_boxes.splice(
        this.bounding_boxes.indexOf(this.selectedLabel.box), 1);

    let ind = -1;
    for (let i = 0; i < this.label_list.childNodes.length; i++) {
        if (this.label_list.childNodes[i].label == this.selectedLabel) {
            ind = i;
        }
    }

    this.label_list.removeChild(this.label_list.childNodes[ind]);

    let id = this.selectedLabel.id;
    this.selectedLabel.valid = false;

    this.deselect();

    for (let i = 0; i < this.labels.length; i++) {
        if (this.labels[i].id == id) {
            ind = i;
            break;
        }
    }

    this.labels[ind].delete();
};

SatPointCloud.prototype.convertMouseToNDC = function(mX, mY) {
    let x = (mX - this.container.offsetLeft) /
        this.container.offsetWidth;
    let y = mY / this.container.offsetHeight;
    x -= this.currentView.left;
    x /= this.currentView.width;
    x = 2 * x - 1;
    y -= this.currentView.top;
    y /= this.currentView.height;
    y = -2 * y + 1;

    return [x, y];
};

SatPointCloud.prototype.calculateProjectionFromMouse = function(mX, mY) {
    // Convert mX and mY to NDC
    let NDC = this.convertMouseToNDC(mX+0.0, mY+0.0);

    let projection = new THREE.Vector3(NDC[0], NDC[1], 0.5);

    projection.unproject(this.currentCamera);

    projection.sub(this.currentCamera.position);
    projection.normalize();

    return projection;
};

SatPointCloud.prototype.highlightMousedOverBox = function(mX, mY) {
    let NDC = this.convertMouseToNDC(mX, mY);
    let x = NDC[0];
    let y = NDC[1];

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.currentCamera);

    let intersects = this.raycaster.intersectObjects(this.bounding_boxes);

    // Unhighlight previous box
    if (this.boxMouseOver != null) {
        this.boxMouseOver.outline.material.color.set(0xffffff);
        this.boxMouseOver = null;
    }

    // Highlight current box
    if (intersects.length > 0) {
        this.boxMouseOver = intersects[0].object;
        this.boxMouseOver.outline.material.color.set(0xff0000);
        this.boxMouseOverPoint = intersects[0].point;
    }
};

SatPointCloud.prototype.toJson = function() {
    let item = SatItem.prototype.toJson.call(this);
    let view = [];

    item.data = {};
    view.push([this.target.x, this.target.y, this.target.z]);

    for (let i = 0; i < this.views.length; i++) {
        view.push([this.views[i].camera.position.x,
                          this.views[i].camera.position.y,
                          this.views[i].camera.position.z]);
    }

    item.data['view'] = view;

    return item;
};

SatPointCloud.prototype.fromJson = function(item) {
    SatItem.prototype.fromJson.call(this, item);

    if (item.data && item.data['view']) {
        this.target.x = item.data['view'][0][0];
        this.target.y = item.data['view'][0][1];
        this.target.z = item.data['view'][0][2];

        this.sphere.position.copy(this.target);

        for (let i = 1; i < item.data['view'].length; i++) {
            this.views[i - 1].camera.position.x = item.data['view'][i][0];
            this.views[i - 1].camera.position.y = item.data['view'][i][1];
            this.views[i - 1].camera.position.z = item.data['view'][i][2];
            this.views[i - 1].camera.lookAt(this.target);
        }
    }
    for (let i = 0; i < this.labels.length; i++) {
        this.addBoundingBox(this.labels[i]);
    }
};
