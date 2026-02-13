// Global state
const state = {
    schedule: {
        XXL: new Set(),
        XL: new Set(),
        L: new Set(),
        M: new Set(),
        S: new Set()
    },
    channels: {
        'Google Search': true,
        'TikTok Video': true,
        'Meta Video': true,
        'YouTube': true,
        'Outdoor - Brand': true,
        'Outdoor - Performance': true,
        'Display': true,
        'Radio': true,
        'TV': true,
        'Podcast': true
    },
    scenarioName: '',
    budget: 0
};

const categories = ['XXL', 'XL', 'L', 'M', 'S'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const channelList = Object.keys(state.channels);

// Pre-generated curve parameters (50 curves: 10 channels x 5 prize categories)
const curveParams = generateCurveParams();

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initScheduleTable();
    initChannelGrid();
});

function goToPage(pageNum) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page${pageNum}`).classList.add('active');
}

function initScheduleTable() {
    const tbody = document.getElementById('scheduleTable');
    tbody.innerHTML = categories.map(cat => `
        <tr>
            <td class="fw-bold">${cat}</td>
            ${months.map((m, i) => `
                <td class="p-0">
                    <div class="month-cell" data-category="${cat}" data-month="${i}" 
                         onclick="toggleMonth('${cat}', ${i})">
                        ${m.charAt(0)}
                    </div>
                </td>
            `).join('')}
        </tr>
    `).join('');
}

function toggleMonth(category, monthIndex) {
    const cell = document.querySelector(`[data-category="${category}"][data-month="${monthIndex}"]`);
    
    if (state.schedule[category].has(monthIndex)) {
        state.schedule[category].delete(monthIndex);
        cell.classList.remove('active');
    } else {
        state.schedule[category].add(monthIndex);
        cell.classList.add('active');
    }
}

function initChannelGrid() {
    const grid = document.getElementById('channelGrid');
    grid.innerHTML = channelList.map(channel => `
        <div class="col-md-6">
            <div class="channel-card active" data-channel="${channel}" onclick="toggleChannel('${channel}')">
                <i class="bi bi-megaphone fs-2 mb-2 d-block"></i>
                <div class="fw-semibold">${channel}</div>
            </div>
        </div>
    `).join('');
}

function toggleChannel(channel) {
    const card = document.querySelector(`[data-channel="${channel}"]`);
    state.channels[channel] = !state.channels[channel];
    card.classList.toggle('active');
}

function generateCurveParams() {
    const params = {};
    const prizeMultipliers = { XXL: 5, XL: 4, L: 3, M: 2, S: 1 };
    
    channelList.forEach((channel, chIdx) => {
        categories.forEach((category, catIdx) => {
            const key = `${channel}_${category}`;
            
            // Generate random parameters with some variation
            const baseCoef = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
            const dimRetParam = 0.4 + Math.random() * 0.3; // 0.4 to 0.7
            const prizeParam = prizeMultipliers[category] * (0.8 + Math.random() * 0.4); // ±20% variation
            
            params[key] = {
                coef: baseCoef,
                dimRet: dimRetParam,
                prize: prizeParam
            };
        });
    });
    
    return params;
}

function diminishingReturns(x, alpha) {
    // Diminishing returns curve: x^alpha
    return Math.pow(x / 100000, alpha) * 100000;
}

function calculateUplift(spend, channel, category) {
    const key = `${channel}_${category}`;
    const params = curveParams[key];
    
    if (!params || spend === 0) return 0;
    
    const transformed = diminishingReturns(spend, params.dimRet);
    return params.coef * transformed * params.prize;
}

function runOptimization() {
    // Get inputs
    state.scenarioName = document.getElementById('scenarioName').value || 'Unnamed Scenario';
    state.budget = parseInt(document.getElementById('budgetInput').value) || 500000;
    
    // Build curves for selected channels and active months
    const curves = [];
    
    channelList.forEach(channel => {
        if (!state.channels[channel]) return; // Skip unselected channels
        
        categories.forEach(category => {
            // Check if this category has any active months
            if (state.schedule[category].size === 0) return;
            
            const key = `${channel}_${category}`;
            
            // Create curve points (0 to 100k by 10k)
            const curvePoints = [];
            for (let spend = 0; spend <= 100000; spend += 10000) {
                const uplift = calculateUplift(spend, channel, category);
                curvePoints.push({ spend, uplift });
            }
            
            curves.push({
                category,
                channel,
                key,
                points: curvePoints
            });
        });
    });
    
    // Run hill climb optimization
    const allocation = hillClimbOptimization(curves, state.budget);
    
    // Display results
    displayResults(allocation);
    goToPage(5);
}

function hillClimbOptimization(curves, totalBudget) {
    // Prepare incremental uplift table as per the algorithm
    const incrementalData = [];
    
    curves.forEach(curve => {
        for (let i = 1; i < curve.points.length; i++) {
            const spend = curve.points[i].spend;
            const uplift = curve.points[i].uplift;
            const prevUplift = curve.points[i - 1].uplift;
            const incrementalUplift = uplift - prevUplift;
            const spendIncrement = spend - curve.points[i - 1].spend;
            
            incrementalData.push({
                category: curve.category,
                channel: curve.channel,
                spend: spend,
                uplift: uplift,
                incrementalUplift: incrementalUplift,
                spendIncrement: spendIncrement
            });
        }
    });
    
    // Sort by incremental uplift (descending)
    incrementalData.sort((a, b) => b.incrementalUplift - a.incrementalUplift);
    
    // Allocate budget greedily
    const allocation = {};
    let remainingBudget = totalBudget;
    
    curves.forEach(curve => {
        allocation[curve.key] = 0;
    });
    
    for (const item of incrementalData) {
        const key = `${item.channel}_${item.category}`;
        
        if (remainingBudget >= item.spendIncrement && allocation[key] < item.spend) {
            allocation[key] = item.spend;
            remainingBudget -= item.spendIncrement;
        }
        
        if (remainingBudget <= 0) break;
    }
    
    return allocation;
}

function displayResults(allocation) {
    document.getElementById('resultScenarioName').textContent = state.scenarioName;
    
    const tbody = document.getElementById('resultsTable');
    const maxValue = Math.max(...Object.values(allocation));
    
    let html = '';
    
    channelList.forEach(channel => {
        if (!state.channels[channel]) return;
        
        let rowTotal = 0;
        const rowData = categories.map(cat => {
            const key = `${channel}_${cat}`;
            const value = allocation[key] || 0;
            rowTotal += value;
            return value;
        });
        
        // Only show row if it has any allocation
        if (rowTotal === 0) return;
        
        html += `<tr>
            <td class="fw-semibold">${channel}</td>
            ${categories.map((cat, i) => {
                const value = rowData[i];
                const percentage = maxValue > 0 ? (value / maxValue * 100) : 0;
                return `<td>
                    ${value > 0 ? `
                        <div class="mb-1">£${(value/1000).toFixed(0)}k</div>
                        <div class="databar" style="width: ${percentage}%"></div>
                    ` : '<span class="text-muted">—</span>'}
                </td>`;
            }).join('')}
            <td class="fw-bold">£${(rowTotal/1000).toFixed(0)}k</td>
        </tr>`;
    });
    
    // Add totals row
    const columnTotals = categories.map((cat, i) => {
        let total = 0;
        channelList.forEach(channel => {
            if (state.channels[channel]) {
                const key = `${channel}_${cat}`;
                total += allocation[key] || 0;
            }
        });
        return total;
    });
    
    const grandTotal = columnTotals.reduce((a, b) => a + b, 0);
    
    html += `<tr class="table-light fw-bold">
        <td>TOTAL</td>
        ${columnTotals.map(t => `<td>£${(t/1000).toFixed(0)}k</td>`).join('')}
        <td>£${(grandTotal/1000).toFixed(0)}k</td>
    </tr>`;
    
    tbody.innerHTML = html;
}
