// =====================================================================
// Эмулятор Google Apps Script для тестового режима.
// Реализует только то, что использует Code.gs. Таблица хранится в
// localStorage браузера. Как и настоящие Google Таблицы, строки вида
// "2026-10" превращаются в даты — это нужно, чтобы проверять Code.gs.
// =====================================================================

(function () {

    const STORAGE_KEY = "fintable_mock_spreadsheet_v1";
    const MIN_ROWS = 1000;

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch (error) {
            return {};
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("Не удалось сохранить тестовые данные", error);
        }
    }

    const state = loadState();

    // Как в Google Таблицах: "yyyy-MM" при записи становится датой
    function toSheetValue(value) {
        if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
            const [year, month] = value.split("-").map(Number);
            return { __date: new Date(year, month - 1, 1).toISOString() };
        }
        return value === undefined || value === null ? "" : value;
    }

    function fromSheetValue(value) {
        if (value && typeof value === "object" && value.__date) {
            return new Date(value.__date);
        }
        return value;
    }

    function createSheet(name) {
        if (!state[name]) {
            const headers = (typeof SHEET_HEADERS !== "undefined" && SHEET_HEADERS[name]) || null;
            if (!headers) return null;
            state[name] = [headers.slice()];
            saveState();
        }

        const rows = state[name];

        function isEmptyRow(row) {
            return !row || row.every(cell => cell === "");
        }

        const sheet = {
            getName: () => name,

            getLastRow() {
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (!isEmptyRow(rows[i])) return i + 1;
                }
                return 0;
            },

            getLastColumn() {
                return rows.reduce((max, row) => {
                    let last = row.length;
                    while (last > 0 && row[last - 1] === "") last--;
                    return Math.max(max, last);
                }, 0);
            },

            getMaxRows: () => Math.max(MIN_ROWS, rows.length),

            insertRowsAfter() { /* строки создаются автоматически */ },

            getRange(row, column, numRows = 1, numColumns = 1) {
                return {
                    getValues() {
                        const result = [];
                        for (let r = 0; r < numRows; r++) {
                            const line = [];
                            for (let c = 0; c < numColumns; c++) {
                                const cell = (rows[row - 1 + r] || [])[column - 1 + c];
                                line.push(cell === undefined ? "" : fromSheetValue(cell));
                            }
                            result.push(line);
                        }
                        return result;
                    },

                    setValues(values) {
                        values.forEach((line, r) => {
                            while (rows.length < row + r) rows.push([]);
                            const target = rows[row - 1 + r];
                            line.forEach((value, c) => {
                                while (target.length < column + c) target.push("");
                                target[column - 1 + c] = toSheetValue(value);
                            });
                        });
                        saveState();
                    },

                    setValue(value) {
                        this.setValues([[value]]);
                    }
                };
            }
        };

        return sheet;
    }

    window.SpreadsheetApp = {
        getActiveSpreadsheet() {
            return {
                getSheetByName: name => createSheet(name),
                getSpreadsheetTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone
            };
        }
    };

    window.Session = {
        getScriptTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Поддерживаются форматы "yyyy-MM" и "yyyy-MM-dd"
    window.Utilities = {
        formatDate(date, timeZone, format) {
            const parts = new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).formatToParts(date);

            const get = type => parts.find(p => p.type === type).value;

            return format
                .replace("yyyy", get("year"))
                .replace("MM", get("month"))
                .replace("dd", get("day"));
        }
    };

    window.LockService = {
        getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    };

    window.ContentService = {
        MimeType: { JSON: "application/json" },
        createTextOutput(text) {
            return {
                mimeType: "text/plain",
                getContent: () => text,
                setMimeType(mimeType) {
                    this.mimeType = mimeType;
                    return this;
                }
            };
        }
    };

    window.resetMockSpreadsheet = function () {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) { /* ничего */ }
        location.reload();
    };

})();
