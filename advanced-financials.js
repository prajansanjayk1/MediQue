// Advanced Financial Analytics JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Chart.js if not already loaded
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = initializeAdvancedFinancials;
        document.head.appendChild(script);
    } else {
        initializeAdvancedFinancials();
    }
});

function initializeAdvancedFinancials() {
    // Get DOM elements
    const advFinancialsTodayBtn = document.getElementById('adv-financials-today-btn');
    const advFinancialsWeekBtn = document.getElementById('adv-financials-week-btn');
    const advFinancialsMonthBtn = document.getElementById('adv-financials-month-btn');
    const advFinancialsYearBtn = document.getElementById('adv-financials-year-btn');
    const advFinancialsCustomBtn = document.getElementById('adv-financials-custom-btn');
    const advFinancialsStartDateInput = document.getElementById('adv-financials-start-date');
    const advFinancialsEndDateInput = document.getElementById('adv-financials-end-date');
    const advFinancialsTotalRevenueEl = document.getElementById('adv-financials-total-revenue');
    const advFinancialsAvgRevenueEl = document.getElementById('adv-financials-avg-revenue');
    const advFinancialsPatientCountEl = document.getElementById('adv-financials-patient-count');
    const advFinancialsGrowthRateEl = document.getElementById('adv-financials-growth-rate');
    const advFinancialsTopServicesEl = document.getElementById('adv-financials-top-services');
    const advFinancialsPredictionEl = document.getElementById('adv-financials-prediction');
    const advFinancialsTransactionsList = document.getElementById('adv-financials-transactions-list');
    const advFinancialsExportBtn = document.getElementById('adv-financials-export-btn');
    
    // Chart canvases
    const revenueChartCanvas = document.getElementById('adv-financials-revenue-chart');
    const monthlyChartCanvas = document.getElementById('adv-financials-monthly-chart');
    const forecastChartCanvas = document.getElementById('adv-financials-forecast-chart');
    
    let revenueChart, monthlyChart, forecastChart;
    let currentTransactions = [];
    
    // Set default dates
    const today = new Date();
    const formattedToday = formatDateForInput(today);
    advFinancialsEndDateInput.value = formattedToday;
    
    // Set start date to 30 days ago by default
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    advFinancialsStartDateInput.value = formatDateForInput(thirtyDaysAgo);
    
    // Add event listeners to date range buttons
    advFinancialsTodayBtn.addEventListener('click', () => setDateRange('today'));
    advFinancialsWeekBtn.addEventListener('click', () => setDateRange('week'));
    advFinancialsMonthBtn.addEventListener('click', () => setDateRange('month'));
    advFinancialsYearBtn.addEventListener('click', () => setDateRange('year'));
    advFinancialsCustomBtn.addEventListener('click', () => setDateRange('custom'));
    
    // Add event listeners to date inputs
    advFinancialsStartDateInput.addEventListener('change', fetchFinancialData);
    advFinancialsEndDateInput.addEventListener('change', fetchFinancialData);
    
    // Add event listener to export button
    advFinancialsExportBtn.addEventListener('click', exportToCSV);
    
    // Set initial date range to 'month'
    setDateRange('month');
    
    // Helper function to format date for input fields
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Set date range based on selection
    function setDateRange(range) {
        const today = new Date();
        let startDate = new Date();
        
        // Reset button styles
        [advFinancialsTodayBtn, advFinancialsWeekBtn, advFinancialsMonthBtn, advFinancialsYearBtn, advFinancialsCustomBtn].forEach(btn => {
            btn.classList.remove('bg-[hsl(149_52%_46%)]', 'text-white');
            btn.classList.add('bg-gray-200');
        });
        
        switch(range) {
            case 'today':
                startDate = new Date(today);
                advFinancialsTodayBtn.classList.remove('bg-gray-200');
                advFinancialsTodayBtn.classList.add('bg-[hsl(149_52%_46%)]', 'text-white');
                break;
            case 'week':
                startDate.setDate(today.getDate() - 7);
                advFinancialsWeekBtn.classList.remove('bg-gray-200');
                advFinancialsWeekBtn.classList.add('bg-[hsl(149_52%_46%)]', 'text-white');
                break;
            case 'month':
                startDate.setMonth(today.getMonth() - 1);
                advFinancialsMonthBtn.classList.remove('bg-gray-200');
                advFinancialsMonthBtn.classList.add('bg-[hsl(149_52%_46%)]', 'text-white');
                break;
            case 'year':
                startDate.setFullYear(today.getFullYear() - 1);
                advFinancialsYearBtn.classList.remove('bg-gray-200');
                advFinancialsYearBtn.classList.add('bg-[hsl(149_52%_46%)]', 'text-white');
                break;
            case 'custom':
                // Don't change the dates, just highlight the button
                advFinancialsCustomBtn.classList.remove('bg-gray-200');
                advFinancialsCustomBtn.classList.add('bg-[hsl(149_52%_46%)]', 'text-white');
                fetchFinancialData();
                return;
        }
        
        advFinancialsStartDateInput.value = formatDateForInput(startDate);
        advFinancialsEndDateInput.value = formatDateForInput(today);
        
        fetchFinancialData();
    }
    
    // Fetch financial data from Firestore
    async function fetchFinancialData() {
        try {
            const startDate = new Date(advFinancialsStartDateInput.value);
            const endDate = new Date(advFinancialsEndDateInput.value);
            endDate.setHours(23, 59, 59, 999); // Set to end of day
            
            // Show loading state
            advFinancialsTotalRevenueEl.textContent = "Loading...";
            advFinancialsAvgRevenueEl.textContent = "Loading...";
            advFinancialsPatientCountEl.textContent = "Loading...";
            advFinancialsGrowthRateEl.textContent = "Loading...";
            advFinancialsTransactionsList.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                        Loading transactions...
                    </td>
                </tr>
            `;
            
            // Get Firebase instances from the main app
            const db = window.db; // Assuming db is exposed globally
            const appId = window.appId; // Assuming appId is exposed globally
            
            if (!db || !appId) {
                throw new Error("Firebase not initialized");
            }
            
            // Query all patient visits within the date range
            const visitsQuery = query(
                collection(db, `artifacts/${appId}/public/data/queue`),
                where("status", "==", "seen"),
                where("visitedAt", ">=", startDate),
                where("visitedAt", "<=", endDate)
            );
            
            const querySnapshot = await getDocs(visitsQuery);
            currentTransactions = [];
            let totalRevenue = 0;
            let patientCount = 0;
            const serviceMap = new Map(); // For tracking top services
            const dailyRevenue = {}; // For chart data
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.fee) {
                    const fee = parseFloat(data.fee);
                    totalRevenue += fee;
                    patientCount++;
                    
                    // Track service types
                    const service = data.issue || "General Consultation";
                    if (serviceMap.has(service)) {
                        serviceMap.set(service, serviceMap.get(service) + fee);
                    } else {
                        serviceMap.set(service, fee);
                    }
                    
                    // Track daily revenue for chart
                    const visitDate = data.visitedAt.toDate();
                    const dateKey = formatDateForInput(visitDate);
                    if (dailyRevenue[dateKey]) {
                        dailyRevenue[dateKey] += fee;
                    } else {
                        dailyRevenue[dateKey] = fee;
                    }
                    
                    // Add to transactions list
                    currentTransactions.push({
                        date: visitDate,
                        patient: data.name,
                        service: service,
                        amount: fee
                    });
                }
            });
            
            // Calculate average daily revenue
            const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
            const avgRevenue = totalRevenue / daysDiff;
            
            // Calculate growth rate (comparing to previous period)
            const previousStartDate = new Date(startDate);
            previousStartDate.setDate(previousStartDate.getDate() - daysDiff);
            
            const previousEndDate = new Date(startDate);
            previousEndDate.setDate(previousEndDate.getDate() - 1);
            
            const previousPeriodQuery = query(
                collection(db, `artifacts/${appId}/public/data/queue`),
                where("status", "==", "seen"),
                where("visitedAt", ">=", previousStartDate),
                where("visitedAt", "<=", previousEndDate)
            );
            
            const previousSnapshot = await getDocs(previousPeriodQuery);
            let previousRevenue = 0;
            
            previousSnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.fee) {
                    previousRevenue += parseFloat(data.fee);
                }
            });
            
            let growthRate = 0;
            if (previousRevenue > 0) {
                growthRate = ((totalRevenue - previousRevenue) / previousRevenue) * 100;
            }
            
            // Update UI with financial data
            advFinancialsTotalRevenueEl.textContent = `₹${totalRevenue.toFixed(2)}`;
            advFinancialsAvgRevenueEl.textContent = `₹${avgRevenue.toFixed(2)}`;
            advFinancialsPatientCountEl.textContent = patientCount;
            advFinancialsGrowthRateEl.textContent = `${growthRate.toFixed(1)}%`;
            
            // Update top services
            const topServices = Array.from(serviceMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            advFinancialsTopServicesEl.innerHTML = '';
            topServices.forEach(([service, revenue]) => {
                const percentage = (revenue / totalRevenue) * 100;
                advFinancialsTopServicesEl.innerHTML += `
                    <div class="mb-3">
                        <div class="flex justify-between mb-1">
                            <span class="text-gray-700">${service}</span>
                            <span class="text-gray-700 font-medium">₹${revenue.toFixed(2)}</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div class="bg-[hsl(149_52%_46%)] h-2.5 rounded-full" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            });
            
            // Update transactions list
            advFinancialsTransactionsList.innerHTML = '';
            if (currentTransactions.length === 0) {
                advFinancialsTransactionsList.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                            No transactions found in the selected date range
                        </td>
                    </tr>
                `;
            } else {
                // Sort transactions by date (newest first)
                currentTransactions.sort((a, b) => b.date - a.date);
                
                currentTransactions.forEach(transaction => {
                    advFinancialsTransactionsList.innerHTML += `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">${transaction.date.toLocaleDateString()}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${transaction.patient}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${transaction.service}</td>
                            <td class="px-6 py-4 whitespace-nowrap">₹${transaction.amount.toFixed(2)}</td>
                        </tr>
                    `;
                });
            }
            
            // Generate revenue prediction
            const monthlyAvg = avgRevenue * 30;
            const predictedRevenue = monthlyAvg * (1 + (growthRate / 100));
            advFinancialsPredictionEl.innerHTML = `
                Based on current trends, your projected revenue for next month is 
                <span class="font-bold text-[hsl(149_52%_46%)]">₹${predictedRevenue.toFixed(2)}</span>.
            `;
            
            // Update charts
            updateCharts(dailyRevenue, totalRevenue, previousRevenue, predictedRevenue);
            
        } catch (error) {
            console.error("Error fetching financial data:", error);
            advFinancialsTotalRevenueEl.textContent = "Error";
            advFinancialsAvgRevenueEl.textContent = "Error";
            advFinancialsPatientCountEl.textContent = "Error";
            advFinancialsGrowthRateEl.textContent = "Error";
            advFinancialsTransactionsList.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-red-500">
                        Error loading transactions: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
    
    // Update charts with financial data
    function updateCharts(dailyRevenue, totalRevenue, previousRevenue, predictedRevenue) {
        // Prepare data for revenue trend chart
        const dates = Object.keys(dailyRevenue).sort();
        const revenues = dates.map(date => dailyRevenue[date]);
        
        // Revenue trend chart
        if (revenueChart) {
            revenueChart.destroy();
        }
        
        revenueChart = new Chart(revenueChartCanvas, {
            type: 'line',
            data: {
                labels: dates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Revenue',
                    data: revenues,
                    borderColor: 'hsl(149, 52%, 46%)',
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Revenue: ₹${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value;
                            }
                        }
                    }
                }
            }
        });
        
        // Monthly comparison chart
        if (monthlyChart) {
            monthlyChart.destroy();
        }
        
        monthlyChart = new Chart(monthlyChartCanvas, {
            type: 'bar',
            data: {
                labels: ['Previous Period', 'Current Period'],
                datasets: [{
                    label: 'Total Revenue',
                    data: [previousRevenue, totalRevenue],
                    backgroundColor: [
                        'rgba(156, 163, 175, 0.7)',
                        'rgba(52, 211, 153, 0.7)'
                    ],
                    borderColor: [
                        'rgb(156, 163, 175)',
                        'hsl(149, 52%, 46%)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Revenue: ₹${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value;
                            }
                        }
                    }
                }
            }
        });
        
        // Forecast chart
        if (forecastChart) {
            forecastChart.destroy();
        }
        
        forecastChart = new Chart(forecastChartCanvas, {
            type: 'bar',
            data: {
                labels: ['Current', 'Forecast'],
                datasets: [{
                    label: 'Monthly Revenue',
                    data: [totalRevenue, predictedRevenue],
                    backgroundColor: [
                        'rgba(52, 211, 153, 0.7)',
                        'rgba(59, 130, 246, 0.7)'
                    ],
                    borderColor: [
                        'hsl(149, 52%, 46%)',
                        'rgb(37, 99, 235)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Revenue: ₹${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Export transactions to CSV
    function exportToCSV() {
        if (currentTransactions.length === 0) {
            alert('No transactions to export');
            return;
        }
        
        const startDate = new Date(advFinancialsStartDateInput.value).toLocaleDateString();
        const endDate = new Date(advFinancialsEndDateInput.value).toLocaleDateString();
        
        let csvContent = 'Date,Patient,Service,Amount\n';
        
        currentTransactions.forEach(transaction => {
            const row = [
                transaction.date.toLocaleDateString(),
                transaction.patient,
                transaction.service,
                transaction.amount.toFixed(2)
            ];
            csvContent += row.join(',') + '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `financial_report_${startDate}_to_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Function to attach advanced financials listener
function attachAdvancedFinancialsListener() {
    console.log("Attaching advanced financials listener");
    initializeAdvancedFinancials();
}