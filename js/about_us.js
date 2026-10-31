document.addEventListener("DOMContentLoaded", function () {
    const au_csvUrl = "member_directory/RAMSC26 Member Directory.csv";
    const au_imageFolder = "member_directory/EC26/";
    const au_placeholderImg = "member_directory/person_holder.png";

    // UI tab -> code that appears in the CSV 'ฝ่าย' column
    const au_departmentMap = {
        "Exec": "EC",
        "IA": "IA", "สาราณียกร": "IA",
        "EA": "EA", "วิชาการ": "EA",
        "CC": "CC", "บันเทิง": "CC",
        "AA": "AA", "กีฬา": "AA",
        "OD": "OD", "ศิลปะ": "OD",
        "WB": "WB", "สวัสดิการ": "WB"
    };
    // case-insensitive lookup ("ia", "Ia", "IA " all work)
    const au_deptLookup = {};
    Object.keys(au_departmentMap).forEach(k => {
        au_deptLookup[k.normalize("NFC").toUpperCase()] = au_departmentMap[k];
    });
    const au_knownCodes = new Set(Object.values(au_departmentMap));

    let au_allMembersData = [];
    let au_currentFilter = "Exec";

    fetch(au_csvUrl)
        .then(response => {
            if (!response.ok) throw new Error("CSV file could not be fetched.");
            return response.text();
        })
        .then(csvText => {
            au_allMembersData = au_parseCSV(csvText);
            document.getElementById("au_loading_status").style.display = "none";
            au_renderGrid();
        })
        .catch(error => {
            console.error("Error handling directory data:", error);
            document.getElementById("au_loading_status").innerText = "Failed to load directory data.";
        });

    // ---- CSV parsing: whole text, handles "" escapes, newlines inside quotes, BOM ----
    function au_parseRows(text) {
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
        const rows = [];
        let row = [], cell = "", inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inQuotes) {
                if (c === '"') {
                    if (text[i + 1] === '"') { cell += '"'; i++; }
                    else inQuotes = false;
                } else {
                    cell += c;
                }
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === ",") {
                row.push(cell.trim());
                cell = "";
            } else if (c === "\n" || c === "\r") {
                if (c === "\r" && text[i + 1] === "\n") i++;
                row.push(cell.trim());
                cell = "";
                if (row.some(v => v !== "")) rows.push(row);
                row = [];
            } else {
                cell += c;
            }
        }
        row.push(cell.trim());
        if (row.some(v => v !== "")) rows.push(row);
        return rows;
    }

    function au_clean(s) {
        return (s || "").replace(/\u00a0/g, " ").normalize("NFC").trim();
    }

    function au_parseCSV(text) {
        const rows = au_parseRows(text);
        if (rows.length === 0) return [];

        const headers = rows[0].map(au_clean);
        const nameIdx = headers.indexOf("Name - Surname (English)");
        const deptIdx = headers.indexOf("ฝ่าย");
        const picIdx = headers.indexOf("To picture");
        const roleIdx = headers.indexOf("ตำแหน่ง");

        if (nameIdx === -1 || deptIdx === -1 || picIdx === -1 || roleIdx === -1) {
            console.error("CSV column mismatch. Headers found:", headers);
            return [];
        }

        const results = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const name = au_clean(r[nameIdx]);
            const dept = au_clean(r[deptIdx]);
            if (!name || !dept) {
                console.warn(`Row ${i + 1} skipped (missing name or department):`, r);
                continue;
            }
            results.push({
                name: name,
                thaiDept: dept,
                picFilename: (r[picIdx] || "").trim(),
                roleText: (r[roleIdx] || "").trim()
            });
        }
        return results;
    }

    function au_deptCode(member) {
        const key = member.thaiDept.toUpperCase();
        return au_deptLookup[key] || key;
    }

    // ---- Photo: try several spellings of the file name before giving up ----
    function au_imageCandidates(file) {
        file = (file || "").trim();
        if (!file) return [];
        if (/^https?:\/\//i.test(file)) return [file];

        const out = new Set();
        [file, file.normalize("NFC"), file.normalize("NFD")].forEach(f => {
            const m = f.match(/\.[A-Za-z0-9]{2,5}$/);
            const stem = m ? f.slice(0, -m[0].length) : f;
            const exts = m
                ? [m[0], m[0].toLowerCase(), m[0].toUpperCase()]
                : [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"];
            exts.forEach(e => {
                const path = (stem + e).split("/").map(encodeURIComponent).join("/");
                out.add(au_imageFolder + path);
            });
        });
        return Array.from(out);
    }

    function au_buildImage(member) {
        const img = document.createElement("img");
        img.alt = member.name;
        img.decoding = "async";
        img.loading = "lazy";

        const candidates = au_imageCandidates(member.picFilename);
        let i = 0;
        function tryNext() {
            if (i < candidates.length) {
                img.src = candidates[i++];
            } else {
                img.onerror = null;
                img.src = au_placeholderImg;
                console.warn(`Photo not found for "${member.name}" (file: "${member.picFilename || "none in CSV"}")`);
            }
        }
        img.onerror = tryNext;
        tryNext();
        return img;
    }

    function au_renderGrid() {
        const gridContainer = document.getElementById("au_members_grid");
        gridContainer.innerHTML = "";

        const target = au_departmentMap[au_currentFilter];
        const filtered = au_allMembersData.filter(m => au_deptCode(m) === target);

        // Tell us about people who will never show up in any tab
        au_allMembersData.forEach(m => {
            if (!au_knownCodes.has(au_deptCode(m))) {
                console.warn(`"${m.name}" has an unrecognised department: "${m.thaiDept}"`);
            }
        });

        if (filtered.length === 0) {
            const p = document.createElement("p");
            p.style.cssText = "grid-column: 1/-1; color: #777; margin-top: 20px;";
            p.textContent = "No members found for this category.";
            gridContainer.appendChild(p);
            return;
        }

        filtered.forEach(member => {
            const card = document.createElement("div");
            card.className = "au_card";

            const frame = document.createElement("div");
            frame.className = "au_image_frame";
            frame.appendChild(au_buildImage(member));

            const name = document.createElement("h3");
            name.className = "au_member_name";
            name.textContent = member.name;

            const role = document.createElement("p");
            role.className = "au_member_role";
            role.textContent = member.roleText;

            card.append(frame, name, role);
            gridContainer.appendChild(card);
        });
    }

    const filterButtons = document.querySelectorAll(".au_filter_btn");
    filterButtons.forEach(button => {
        button.addEventListener("click", function () {
            filterButtons.forEach(btn => btn.classList.remove("au_active"));
            this.classList.add("au_active");
            au_currentFilter = this.getAttribute("data-dept");
            au_renderGrid();
        });
    });
});