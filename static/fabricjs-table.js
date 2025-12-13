/**
 * FabricTablePlugin
 * 封装了表格编辑器的所有逻辑。
 */
class FabricTablePlugin {
    constructor(canvas, options = {}) {
        this.canvas = canvas;

        // 基础配置
        this.left = options.left || 100;
        this.top = options.top || 100;
        this.rows = options.rows || 4;
        this.cols = options.cols || 4;
        this.colWidths = Array(this.cols).fill(options.defaultColWidth || 100);
        this.rowHeights = Array(this.rows).fill(options.defaultRowHeight || 40);

        // 样式默认值 (Global Styles)
        this.defaultStyles = {
            fill: '#ffffff',
            stroke: '#e11d48',      // 红色主题
            strokeWidth: 1,
            textFill: '#1e293b',
            fontSize: 14,
            fontFamily: 'SourceHanSerifCN-Bold, serif',
            textAlign: 'center',
            fontWeight: 'normal',
            fontStyle: 'normal'
        };

        // 状态管理
        this.isEditing = false;
        this.data = [];
        this.tableGroup = null;
        this.selectedCells = [];
        this.selectionRect = null;

        // 交互辅助
        this.plusButtons = [];
        this.menuEl = null;
        this.wrapperEl = canvas.wrapperEl;
        this.resizing = null;
        this.isDragging = false;

        // 初始化
        this._initData();
        this._initVisuals();
        this._setupEvents();

        // 初始渲染
        this.renderGroupMode();
    }

    // --- 1. 数据与视觉初始化 ---

    _initData() {
        this.data = [];
        for (let r = 0; r < this.rows; r++) {
            let rowData = [];
            for (let c = 0; c < this.cols; c++) {
                rowData.push({
                    r: r, c: c,
                    rowspan: 1, colspan: 1,
                    text: `R${r + 1}C${c + 1}`,
                    ...this.defaultStyles,
                    hidden: false
                });
            }
            this.data.push(rowData);
        }
    }

    _initVisuals() {
        // 1. 选区矩形 (蓝色半透明)
        this.selectionRect = new fabric.Rect({
            fill: 'rgba(59, 130, 246, 0.15)',
            stroke: '#3b82f6',
            strokeWidth: 2,
            rx: 2, ry: 2, // 微圆角
            visible: false,
            selectable: false,
            evented: false
        });
        this.canvas.add(this.selectionRect);

        // 2. 初始化4个加号按钮
        const createPlusBtn = (id) => {
            const circle = new fabric.Circle({ radius: 10, fill: '#3b82f6', originX: 'center', originY: 'center', stroke: '#fff', strokeWidth: 2, shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.2)', blur: 4, offsetY: 2 }) });
            // 使用简单的 Text '+'，因为 Fabric 渲染 icon font 有时会有位置问题，这里简单为主
            const text = new fabric.Text('+', { fontSize: 18, fill: 'white', originX: 'center', originY: 'center', top: -1, fontWeight: 'bold' });

            // 透明点击区域 (半径18px) - 扩大点击范围
            const hitArea = new fabric.Circle({ radius: 18, fill: 'transparent', originX: 'center', originY: 'center' });

            const grp = new fabric.Group([hitArea, circle, text], {
                visible: false,
                selectable: false,
                hasControls: false,
                hoverCursor: 'pointer',
                name: 'plusBtn',
                id: id,
                originX: 'center',
                originY: 'center',
                evented: true,
                subTargetCheck: false
            });
            return grp;
        };

        this.plusButtons = [
            createPlusBtn('top'), createPlusBtn('bottom'),
            createPlusBtn('left'), createPlusBtn('right')
        ];
        this.plusButtons.forEach(btn => this.canvas.add(btn));
    }

    // --- 2. 渲染核心逻辑 ---

    renderGroupMode() {
        this.isEditing = false;
        this.selectedCells = [];
        this.selectionRect.visible = false;
        this._hidePlusButtons();

        this.canvas.getObjects().forEach(obj => {
            if (obj.data && obj.data.r !== undefined) this.canvas.remove(obj);
        });
        if (this.tableGroup) this.canvas.remove(this.tableGroup);

        const objects = [];
        let currentY = 0;

        for (let r = 0; r < this.rows; r++) {
            let currentX = 0;
            const h = this.rowHeights[r];
            for (let c = 0; c < this.cols; c++) {
                const w = this.colWidths[c];
                const cell = this.data[r][c];

                if (!cell.hidden) {
                    let actualW = 0, actualH = 0;
                    for (let i = 0; i < cell.colspan; i++) actualW += this.colWidths[c + i];
                    for (let i = 0; i < cell.rowspan; i++) actualH += this.rowHeights[r + i];

                    const rect = new fabric.Rect({
                        left: currentX, top: currentY, width: actualW, height: actualH,
                        fill: cell.fill, stroke: cell.stroke, strokeWidth: cell.strokeWidth,
                        originX: 'left', originY: 'top'
                    });

                    const text = new fabric.Text(cell.text || '', {
                        fontSize: cell.fontSize, fill: cell.textFill, fontFamily: cell.fontFamily,
                        fontWeight: cell.fontWeight, fontStyle: cell.fontStyle,
                        originX: 'center', originY: 'center',
                        left: currentX + actualW / 2, top: currentY + actualH / 2
                    });

                    // 简单的对齐偏移
                    if (cell.textAlign === 'left') text.set({ left: currentX + 8, originX: 'left' });
                    if (cell.textAlign === 'right') text.set({ left: currentX + actualW - 8, originX: 'right' });

                    objects.push(rect, text);
                }
                currentX += w;
            }
            currentY += h;
        }

        this.tableGroup = new fabric.Group(objects, {
            left: this.left, top: this.top,
            selectable: true, hasControls: true, subTargetCheck: false,
            lockScalingFlip: true,
            transparentCorners: false, cornerColor: '#3b82f6', cornerStyle: 'circle', cornerSize: 10,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 10, offsetY: 5 })
        });

        this.tableGroup.on('mousedblclick', () => this.enterEditMode());
        this.tableGroup.on('moving', () => this._hideMenu());
        this.tableGroup.on('scaling', () => this._hideMenu());
        this.tableGroup.on('modified', () => {
            this.left = this.tableGroup.left;
            this.top = this.tableGroup.top;
            if (this.tableGroup.scaleX !== 1 || this.tableGroup.scaleY !== 1) {
                const sx = this.tableGroup.scaleX;
                const sy = this.tableGroup.scaleY;
                this.colWidths = this.colWidths.map(w => w * sx);
                this.rowHeights = this.rowHeights.map(h => h * sy);
                this.tableGroup.scaleX = 1;
                this.tableGroup.scaleY = 1;
                this.renderGroupMode();
            }
        });

        this.canvas.add(this.tableGroup);
        this.canvas.requestRenderAll();
    }

    enterEditMode() {
        if (this.isEditing) return;
        this.isEditing = true;
        this._hideMenu();
        this._hidePlusButtons();

        this.left = this.tableGroup.left;
        this.top = this.tableGroup.top;
        this.canvas.remove(this.tableGroup);
        this.tableGroup = null;

        this.renderEditMode();
    }

    renderEditMode() {
        this.canvas.getObjects().forEach(obj => {
            if (obj.data && obj.data.r !== undefined) this.canvas.remove(obj);
        });

        this.selectionRect.visible = false;
        this.canvas.bringToFront(this.selectionRect);

        let currentY = this.top;
        for (let r = 0; r < this.rows; r++) {
            let currentX = this.left;
            const h = this.rowHeights[r];
            for (let c = 0; c < this.cols; c++) {
                const w = this.colWidths[c];
                const cell = this.data[r][c];

                if (!cell.hidden) {
                    let actualW = 0, actualH = 0;
                    for (let i = 0; i < cell.colspan; i++) actualW += this.colWidths[c + i];
                    for (let i = 0; i < cell.rowspan; i++) actualH += this.rowHeights[r + i];

                    const rect = new fabric.Rect({
                        left: currentX, top: currentY, width: actualW, height: actualH,
                        fill: cell.fill, stroke: '#e2e8f0', strokeWidth: 1,
                        selectable: false, evented: false,
                        data: cell
                    });

                    const text = new fabric.IText(cell.text || '', {
                        fontSize: cell.fontSize, fill: cell.textFill, fontFamily: cell.fontFamily,
                        fontWeight: cell.fontWeight, fontStyle: cell.fontStyle,
                        originX: 'center', originY: 'center',
                        left: currentX + actualW / 2, top: currentY + actualH / 2,
                        selectable: false, evented: false,
                        data: cell
                    });

                    if (cell.textAlign === 'left') text.set({ left: currentX + 8, originX: 'left' });
                    if (cell.textAlign === 'right') text.set({ left: currentX + actualW - 8, originX: 'right' });

                    this.canvas.add(rect);
                    this.canvas.add(text);
                    cell.rectObj = rect;
                    cell.textObj = text;
                }
                currentX += w;
            }
            currentY += h;
        }
        this.canvas.requestRenderAll();
    }

    exitEditMode() {
        if (!this.isEditing) return;
        this.selectedCells = [];
        this.renderGroupMode();
        this._hideMenu();
    }

    // --- 3. 事件管理 ---

    _setupEvents() {
        this.canvas.on('mouse:down', (opt) => this._handleMouseDown(opt));
        this.canvas.on('mouse:move', (opt) => this._handleMouseMove(opt));
        this.canvas.on('mouse:up', (opt) => this._handleMouseUp(opt));

        this.canvas.on('mouse:dblclick', (opt) => {
            if (!this.isEditing) return;
            const pointer = this.canvas.getPointer(opt.e);
            const cell = this._getCellAtPoint(pointer.x, pointer.y);
            if (cell && cell.textObj && !cell.hidden) {
                this._hideMenu();
                const text = cell.textObj;
                text.selectable = true; text.evented = true;
                this.canvas.setActiveObject(text);
                text.enterEditing(); text.selectAll();
                text.on('editing:exited', () => {
                    cell.text = text.text;
                    text.selectable = false; text.evented = false;
                });
            }
        });

        document.addEventListener('mousemove', (e) => {
            const menu = this.menuEl;
            if (menu.style.display !== 'none') {
                const rect = menu.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > Math.max(rect.width, rect.height) + 100) {
                    this._hideMenu();
                }
            }
        });
    }

    _handleMouseDown(opt) {
        const pointer = this.canvas.getPointer(opt.e);

        // 几何检测按钮点击
        const clickedBtn = this.plusButtons.find(btn => {
            if (!btn.visible) return false;
            const dist = Math.sqrt(Math.pow(pointer.x - btn.left, 2) + Math.pow(pointer.y - btn.top, 2));
            return dist <= 18; // 半径匹配 hitArea
        });

        if (clickedBtn) {
            this._handlePlusClick(clickedBtn.id);
            return;
        }

        if (this.canvas.getActiveObject()?.isEditing) return;
        this._hideMenu();

        if (!this.isEditing) {
            if (!opt.target) {
                this.canvas.discardActiveObject();
                this._hidePlusButtons();
            }
            return;
        }

        const resizeInfo = this._getResizeTarget(pointer.x, pointer.y);
        if (resizeInfo) {
            this.resizing = resizeInfo;
            return;
        }

        if (!this._isInTableBounds(pointer.x, pointer.y)) {
            this.exitEditMode();
            return;
        }

        const cell = this._getCellAtPoint(pointer.x, pointer.y);
        if (cell) {
            this.isDragging = true;
            this.selectionStart = cell;
            this._updateSelection(cell, cell);
        }
    }

    _handleMouseMove(opt) {
        const pointer = this.canvas.getPointer(opt.e);

        if (!this.isEditing && this.tableGroup) {
            this._updatePlusButtons(pointer);
        }

        if (this.isEditing) {
            if (this.resizing) {
                this._performResize(pointer);
                return;
            }
            if (this.isDragging) {
                const cell = this._getCellAtPoint(pointer.x, pointer.y);
                if (cell) this._updateSelection(this.selectionStart, cell);
                return;
            }
            const resizeInfo = this._getResizeTarget(pointer.x, pointer.y);
            this.canvas.defaultCursor = resizeInfo ? (resizeInfo.type === 'col' ? 'col-resize' : 'row-resize') : 'default';
        }
    }

    _handleMouseUp(opt) {
        this.isDragging = false;
        this.resizing = null;

        const { clientX, clientY } = opt.e;

        if (this.isEditing && this.selectedCells.length > 0) {
            this._showContextMenu(clientX, clientY, 'cell');
        } else if (!this.isEditing && this.canvas.getActiveObject() === this.tableGroup) {
            if (opt.target === this.tableGroup) {
                this._showContextMenu(clientX, clientY, 'table');
            }
        }
    }

    // --- 4. 结构修改 ---

    _updatePlusButtons(pointer) {
        if (!this.tableGroup) return;
        const b = this.tableGroup.getBoundingRect();
        const buffer = 40;

        const showBtn = (id, x, y) => {
            const btn = this.plusButtons.find(b => b.id === id);
            btn.set({ left: x, top: y, visible: true });
            btn.bringToFront();
        };

        this._hidePlusButtons();

        if (pointer.x > b.left && pointer.x < b.left + b.width) {
            if (Math.abs(pointer.y - b.top) < buffer) showBtn('top', b.left + b.width / 2, b.top - 18);
            else if (Math.abs(pointer.y - (b.top + b.height)) < buffer) showBtn('bottom', b.left + b.width / 2, b.top + b.height + 18);
        }
        if (pointer.y > b.top && pointer.y < b.top + b.height) {
            if (Math.abs(pointer.x - b.left) < buffer) showBtn('left', b.left - 18, b.top + b.height / 2);
            else if (Math.abs(pointer.x - (b.left + b.width)) < buffer) showBtn('right', b.left + b.width + 18, b.top + b.height / 2);
        }

        this.canvas.requestRenderAll();
    }

    _hidePlusButtons() {
        this.plusButtons.forEach(b => b.set('visible', false));
    }

    _handlePlusClick(id) {
        if (id === 'top') { this._modifyStructure('row', 0); }
        if (id === 'bottom') { this._modifyStructure('row', this.rows); }
        if (id === 'left') { this._modifyStructure('col', 0); }
        if (id === 'right') { this._modifyStructure('col', this.cols); }
    }

    _modifyStructure(type, index) {
        if (type === 'row') {
            const newRow = Array(this.cols).fill(null).map((_, c) => ({
                r: index, c: c, rowspan: 1, colspan: 1, text: '', ...this.defaultStyles, hidden: false
            }));
            this.data.splice(index, 0, newRow);
            this.rowHeights.splice(index, 0, 40);
            this.rows++;
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.data[r][c].r = r;
        } else {
            this.data.forEach((row, r) => {
                row.splice(index, 0, {
                    r: r, c: index, rowspan: 1, colspan: 1, text: '', ...this.defaultStyles, hidden: false
                });
            });
            this.colWidths.splice(index, 0, 100);
            this.cols++;
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.data[r][c].c = c;
        }

        this._resetMerges();
        this.renderGroupMode();
    }

    // --- 5. 菜单 UI 生成 (Phosphor Icons) ---

    _showContextMenu(x, y, type) {
        // 延迟创建菜单 DOM，避免多次创建
        if (!this.menuEl) {
            this.menuEl = document.createElement('div');
            this.menuEl.id = 'table-floating-menu';
            this.menuEl.className = 'fixed bg-white rounded-xl shadow-xl border border border-gray-200 p-2 flex items-center gap-1 z-50 text-sm';
            document.body.appendChild(this.menuEl);
        }

        this.menuEl.style.display = 'flex';
        this.menuEl.innerHTML = '';

        // 智能定位
        const rect = this.canvas.wrapperEl.getBoundingClientRect();
        let left = x - rect.left + 10;
        let top = y - rect.top + 10;

        if (left + 400 > rect.width) left = rect.width - 410;
        if (top + 80 > rect.height) top = y - rect.top - 80;

        this.menuEl.style.left = `${rect.left + left}px`;
        this.menuEl.style.top = `${rect.top + top}px`;

        this._generateMenuContent(type);

        // 点击外部自动隐藏
        const hide = () => {
            this.menuEl.style.display = 'none';
            document.removeEventListener('mousedown', hide);
        };
        setTimeout(() => document.addEventListener('mousedown', hide), 100);
    }

    _hideMenu() {
        this.menuEl.style.display = 'none';
    }

    _generateMenuContent(type) {
        const createGroup = () => { const div = document.createElement('div'); div.className = 'menu-group'; return div; };

        const createBtn = (iconClass, title, onClick, disabled = false, active = false) => {
            const btn = document.createElement('button');
            btn.className = `menu-btn ${active ? 'active' : ''}`;
            btn.innerHTML = `<i class="${iconClass}"></i>`;
            btn.title = title;
            btn.disabled = disabled;
            btn.onmousedown = (e) => { e.stopPropagation(); onClick(); };
            return btn;
        };

        const createColor = (iconClass, color, title, onChange) => {
            const w = document.createElement('div'); w.className = 'color-btn-wrapper'; w.title = title;
            w.innerHTML = `<i class="${iconClass}" style="font-size: 16px;"></i><div class="color-indicator" style="background-color: ${color}"></div>`;
            const i = document.createElement('input'); i.type = 'color'; i.value = color;
            i.oninput = (e) => {
                onChange(e.target.value);
                w.querySelector('.color-indicator').style.backgroundColor = e.target.value;
            };
            w.appendChild(i); return w;
        };

        const createSelect = (options, onChange, initial) => {
            const s = document.createElement('select'); s.className = 'menu-select';
            options.forEach(opt => { const o = document.createElement('option'); o.value = opt; o.text = opt; if (opt === initial) o.selected = true; s.appendChild(o); });
            s.onchange = (e) => onChange(e.target.value); return s;
        };

        const createInput = (val, title, onChange, min = 0) => {
            const i = document.createElement('input'); i.className = 'menu-input'; i.type = 'number'; i.value = val; i.min = min; i.title = title;
            i.onchange = (e) => onChange(parseInt(e.target.value)); return i;
        }

        const target = this.selectedCells.length > 0 ? this.selectedCells[0] : this.data[0][0];

        // 1. 字体组
        const g1 = createGroup();
        g1.appendChild(createSelect(['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Inter'], (v) => this._applyStyle('fontFamily', v), target.fontFamily));
        g1.appendChild(createInput(target.fontSize, '字号', (v) => this._applyStyle('fontSize', v), 8));
        g1.appendChild(createBtn('ph-bold ph-text-b', '加粗', () => this._applyStyle('fontWeight', target.fontWeight === 'bold' ? 'normal' : 'bold'), false, target.fontWeight === 'bold'));
        g1.appendChild(createBtn('ph-bold ph-text-italic', '斜体', () => this._applyStyle('fontStyle', target.fontStyle === 'italic' ? 'normal' : 'italic'), false, target.fontStyle === 'italic'));
        this.menuEl.appendChild(g1);

        // 2. 对齐组
        const g2 = createGroup();
        g2.appendChild(createBtn('ph-bold ph-text-align-left', '左对齐', () => this._applyStyle('textAlign', 'left'), false, target.textAlign === 'left'));
        g2.appendChild(createBtn('ph-bold ph-text-align-center', '居中', () => this._applyStyle('textAlign', 'center'), false, target.textAlign === 'center'));
        g2.appendChild(createBtn('ph-bold ph-text-align-right', '右对齐', () => this._applyStyle('textAlign', 'right'), false, target.textAlign === 'right'));
        this.menuEl.appendChild(g2);

        // 3. 颜色组
        const g3 = createGroup();
        g3.appendChild(createColor('ph-bold ph-text-t', target.textFill, '文字颜色', (v) => this._applyStyle('textFill', v)));
        g3.appendChild(createColor('ph-bold ph-paint-bucket', target.fill, '背景颜色', (v) => this._applyStyle('fill', v)));
        g3.appendChild(createColor('ph-bold ph-pencil-simple', target.stroke, '边框颜色', (v) => this._applyStyle('stroke', v)));
        this.menuEl.appendChild(g3);

        // 4. 边框粗细
        const g4 = createGroup();
        g4.appendChild(createInput(target.strokeWidth, '边框宽度', (v) => this._applyStyle('strokeWidth', v), 0));
        this.menuEl.appendChild(g4);

        // 5. 操作组
        const g5 = createGroup();
        if (type === 'cell') {
            const canMerge = this.selectedCells.length > 1;
            const canSplit = this.selectedCells.length === 1 && (this.selectedCells[0].colspan > 1 || this.selectedCells[0].rowspan > 1);
            g5.appendChild(createBtn('ph-bold ph-arrows-in-simple', '合并单元格', () => this._mergeCells(), !canMerge));
            g5.appendChild(createBtn('ph-bold ph-arrows-out-simple', '拆分单元格', () => this._splitCell(), !canSplit));

            // 删除操作
            const gDelete = createGroup(); // 单独分个删除组
            gDelete.appendChild(createBtn('ph-bold ph-trash', '删除所在行', () => this._removeRow(), false));
            gDelete.appendChild(createBtn('ph-bold ph-x-circle', '删除所在列', () => this._removeCol(), false));
            this.menuEl.appendChild(g5);
            this.menuEl.appendChild(gDelete);
        } else {
            // 全局重置
            g5.appendChild(createBtn('ph-bold ph-arrow-counter-clockwise', '重置默认样式', () => this._resetStyles(), false));
            this.menuEl.appendChild(g5);
        }
    }

    _applyStyle(prop, val) {
        if (this.isEditing) {
            this.selectedCells.forEach(c => c[prop] = val);
            this.renderEditMode();
        } else {
            this.data.forEach(row => row.forEach(c => c[prop] = val));
            this.defaultStyles[prop] = val;
            this.renderGroupMode();
        }
    }

    _resetStyles() {
        const hardcodedDefaults = {
            fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1,
            textFill: '#334155', fontSize: 14, fontFamily: 'Arial',
            textAlign: 'center', fontWeight: 'normal', fontStyle: 'normal'
        };
        this.defaultStyles = { ...hardcodedDefaults };
        this.data.forEach(row => row.forEach(c => Object.assign(c, hardcodedDefaults)));
        this.renderGroupMode();
    }

    // --- 6. 辅助逻辑 ---
    _getTableWidth() { return this.colWidths.reduce((a, b) => a + b, 0); }
    _getTableHeight() { return this.rowHeights.reduce((a, b) => a + b, 0); }

    _isInTableBounds(x, y) {
        return x >= this.left && x <= this.left + this._getTableWidth() &&
            y >= this.top && y <= this.top + this._getTableHeight();
    }

    _getCellAtPoint(x, y) {
        if (!this._isInTableBounds(x, y)) return null;
        const relX = x - this.left; const relY = y - this.top;
        let c = -1, accumW = 0;
        for (let i = 0; i < this.cols; i++) {
            if (relX >= accumW && relX < accumW + this.colWidths[i]) { c = i; break; }
            accumW += this.colWidths[i];
        }
        let r = -1, accumH = 0;
        for (let i = 0; i < this.rows; i++) {
            if (relY >= accumH && relY < accumH + this.rowHeights[i]) { r = i; break; }
            accumH += this.rowHeights[i];
        }
        if (r !== -1 && c !== -1) return this.data[r][c];
        return null;
    }

    _getResizeTarget(x, y) {
        const t = 8;
        let cx = this.left;
        for (let c = 0; c < this.cols; c++) {
            cx += this.colWidths[c];
            if (Math.abs(x - cx) < t && y > this.top && y < this.top + this._getTableHeight()) return { type: 'col', index: c, start: x, size: this.colWidths[c] };
        }
        let cy = this.top;
        for (let r = 0; r < this.rows; r++) {
            cy += this.rowHeights[r];
            if (Math.abs(y - cy) < t && x > this.left && x < this.left + this._getTableWidth()) return { type: 'row', index: r, start: y, size: this.rowHeights[r] };
        }
        return null;
    }

    _performResize(pointer) {
        if (!this.resizing) return;
        if (this.resizing.type === 'col') {
            const w = Math.max(20, this.resizing.size + (pointer.x - this.resizing.start));
            this.colWidths[this.resizing.index] = w;
        } else {
            const h = Math.max(20, this.resizing.size + (pointer.y - this.resizing.start));
            this.rowHeights[this.resizing.index] = h;
        }
        this.renderEditMode();
    }

    _updateSelection(start, end) {
        const minR = Math.min(start.r, end.r), maxR = Math.max(start.r + start.rowspan - 1, end.r + end.rowspan - 1);
        const minC = Math.min(start.c, end.c), maxC = Math.max(start.c + start.colspan - 1, end.c + end.colspan - 1);

        this.selectedCells = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.data[r][c];
                if (cell.hidden) continue;
                const endR = cell.r + cell.rowspan - 1, endC = cell.c + cell.colspan - 1;
                if (!(endR < minR || cell.r > maxR || endC < minC || cell.c > maxC)) {
                    this.selectedCells.push(cell);
                    if (cell.rectObj) {
                        minX = Math.min(minX, cell.rectObj.left); minY = Math.min(minY, cell.rectObj.top);
                        maxX = Math.max(maxX, cell.rectObj.left + cell.rectObj.width); maxY = Math.max(maxY, cell.rectObj.top + cell.rectObj.height);
                    }
                }
            }
        }

        if (minX !== Infinity) {
            this.selectionRect.set({ left: minX, top: minY, width: maxX - minX, height: maxY - minY, visible: true });
            this.selectionRect.bringToFront();
            this.canvas.requestRenderAll();
        }
    }

    _mergeCells() {
        if (this.selectedCells.length < 2) return;
        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        this.selectedCells.forEach(c => {
            minR = Math.min(minR, c.r); maxR = Math.max(maxR, c.r + c.rowspan - 1);
            minC = Math.min(minC, c.c); maxC = Math.max(maxC, c.c + c.colspan - 1);
        });
        const master = this.data[minR][minC];
        master.rowspan = maxR - minR + 1; master.colspan = maxC - minC + 1;
        master.hidden = false;
        for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
            if (r === minR && c === minC) continue;
            this.data[r][c].hidden = true;
        }
        this.selectedCells = [master];
        this.renderEditMode();
    }

    _splitCell() {
        if (this.selectedCells.length !== 1) return;
        const cell = this.selectedCells[0];
        const endR = cell.r + cell.rowspan - 1, endC = cell.c + cell.colspan - 1;
        for (let r = cell.r; r <= endR; r++) for (let c = cell.c; c <= endC; c++) {
            this.data[r][c].hidden = false;
            this.data[r][c].rowspan = 1; this.data[r][c].colspan = 1;
        }
        this.renderEditMode();
    }

    _removeRow() {
        if (this.selectedCells.length === 0) return;
        const targetR = this.selectedCells[0].r;
        this.data.splice(targetR, 1);
        this.rowHeights.splice(targetR, 1);
        this.rows--;
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.data[r][c].r = r;
        this._resetMerges(); this.renderEditMode();
    }

    _removeCol() {
        if (this.selectedCells.length === 0) return;
        const targetC = this.selectedCells[0].c;
        for (let r = 0; r < this.rows; r++) this.data[r].splice(targetC, 1);
        this.colWidths.splice(targetC, 1);
        this.cols--;
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.data[r][c].c = c;
        this._resetMerges(); this.renderEditMode();
    }

    _resetMerges() {
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            this.data[r][c].rowspan = 1; this.data[r][c].colspan = 1; this.data[r][c].hidden = false;
        }
    }
}