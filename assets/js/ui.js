import { PRIZE_CATS, CHANNELS, MONTHS } from "./curves.js";

export function money(n) {
  const x = Math.round(Number(n || 0));
  return x.toLocaleString("en-GB");
}

export function setStepUI({ stepIndex, labels }) {
  const stepNum = document.getElementById("stepNum");
  const stepLabel = document.getElementById("stepLabel");
  const stepProgress = document.getElementById("stepProgress");
  stepNum.textContent = String(stepIndex + 1);
  stepLabel.textContent = labels[stepIndex] ?? "";
  stepProgress.style.width = `${((stepIndex + 1) / 5) * 100}%`;
}

export function showView(viewId) {
  document.querySelectorAll(".view").forEach((el) => el.classList.add("d-none"));
  document.getElementById(viewId).classList.remove("d-none");
}

export function renderPlanTables({ mountEl, planByCat }) {
  mountEl.innerHTML = "";

  for (const cat of PRIZE_CATS) {
    const card = document.createElement("div");

    const title = document.createElement("div");
    title.className = "plan-title mb-2";
    title.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span class="badge text-bg-light border">${cat}</span>
        <span class="text-secondary small">Toggle months when the ${cat} draw is live</span>
      </div>
      <button class="btn btn-sm btn-outline-secondary" data-clear="${cat}">
        <i class="bi bi-eraser me-1"></i> Clear
      </button>
    `;

    const table = document.createElement("table");
    table.className = "plan-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Prize draw</th>
        ${MONTHS.map((m) => `<th>${m}</th>`).join("")}
      </tr>
    `;

    const tbody = document.createElement("tbody");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="fw-semibold">${cat}</td>
      ${MONTHS.map((_, mi) => {
        const on = planByCat[cat]?.[mi] ? "is-on" : "";
        return `<td class="month-cell ${on}" data-cat="${cat}" data-month="${mi}"></td>`;
      }).join("")}
    `;
    tbody.appendChild(row);

    table.appendChild(thead);
    table.appendChild(tbody);

    card.appendChild(title);
    card.appendChild(table);
    mountEl.appendChild(card);
  }
}

export function renderChannelGrid({ mountEl, selected }) {
  mountEl.innerHTML = "";
  for (const ch of CHANNELS) {
    const on = selected.has(ch.id);
    const el = document.createElement("div");
    el.className = `channel-tile ${on ? "is-on" : ""}`;
    el.dataset.channelId = ch.id;
    el.innerHTML = `
      <div class="d-flex align-items-center justify-content-between">
        <div class="label">${ch.label}</div>
        <i class="bi ${ch.icon} fs-5"></i>
      </div>
      <div class="meta d-flex align-items-center justify-content-between">
        <span>${on ? "Included" : "Excluded"}</span>
        <span class="badge ${on ? "text-bg-success" : "text-bg-secondary"}">${on ? "ON" : "OFF"}</span>
      </div>
    `;
    mountEl.appendChild(el);
  }
}

export function renderResultTable({ tableEl, matrix, channels, prizeCats }) {
  // Find max cell for databars
  let maxCell = 0;
  for (const val of matrix.values()) maxCell = Math.max(maxCell, val);

  const header = `
    <thead>
      <tr>
        <th class="text-secondary small">Channel</th>
        ${prizeCats.map((c) => `<th class="text-secondary small">${c}</th>`).join("")}
      </tr>
    </thead>
  `;

  const rows = [];
  let grandTotal = 0;

  for (const ch of channels) {
    let rowTotal = 0;

    const tds = prizeCats.map((pc) => {
      const key = `${ch.id}__${pc}`;
      const v = matrix.get(key) ?? 0;
      rowTotal += v;
      grandTotal += v;

      const w = maxCell > 0 ? Math.round((v / maxCell) * 100) : 0;
      return `
        <td class="db-cell">
          ${v > 0 ? `<div class="db-bar" style="transform: scaleX(${w / 100});"></div>` : ""}
          <span class="db-text">${v ? money(v) : ""}</span>
        </td>
      `;
    }).join("");

    rows.push(`
      <tr>
        <td class="fw-semibold">${ch.label}</td>
        ${tds}
      </tr>
    `);
  }

  const totalRow = `
    <tr class="table-light">
      <td class="fw-semibold">Total</td>
      ${prizeCats.map((pc) => {
        let colTotal = 0;
        for (const ch of channels) {
          colTotal += matrix.get(`${ch.id}__${pc}`) ?? 0;
        }
        return `<td class="fw-semibold">${colTotal ? money(colTotal) : ""}</td>`;
      }).join("")}
    </tr>
  `;

  tableEl.innerHTML = header + `<tbody>${rows.join("")}${totalRow}</tbody>`;
}
