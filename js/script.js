
// set margin
const margin = { top: 80, right: 60, bottom: 60, left: 100 };
const width = 800 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

let allData = []
let yVar = 'TMAX'       // which temperature the Y axis shows; the Y dropdown changes this
let selectedState       // which state's stations we draw; set after the data loads
let dateRange           // [startDate, endDate] from the slider; set after the data loads
let xScale, yScale
let searchTerm = ''   // text typed into the station search box


const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

// The two choices for the Y axis
const yOptions = ['TMIN', 'TMAX'];

const t = 1000; // 1000ms = 1 second

// Create SVG
const svg = d3.select('#vis')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);


function init(){
    d3.csv('./data/weather_clean.csv',
    function(d){
        return {
            station: d.station,
            state: d.state,
            date: d3.timeParse('%Y-%m-%d')(d.date), // string -> real Date object
            latitude: +d.latitude,
            longitude: +d.longitude,
            TMIN: +d.TMIN,
            TMAX: +d.TMAX
        }
    })
    .then(data => {
        console.log(data) // check the structure in the console
        allData = data    // save the processed data

        setupSelector()   // build the dropdowns + slider
        updateAxes()      // draw the axes
        updateVis()       // draw the lines
        addLegend()     // we'll revisit this once the lines are drawing
    })
    .catch(error => console.error('Error loading data:', error));
}

function setupSelector(){
    /// --- State dropdown (Category I: dynamic filter) ---
    // Unique list of states, sorted, pulled from the data itself.
    const states = Array.from(new Set(allData.map(d => d.state))).sort();
    selectedState = states[0];   // default to the first state alphabetically

    d3.select('#stateVariable')
        .selectAll('option')
        .data(states)
        .enter()
        .append('option')
        .text(d => d)
        .attr('value', d => d);

    d3.select('#stateVariable').property('value', selectedState);

    d3.select('#stateVariable').on('change', function () {
        selectedState = d3.select(this).property('value');
        updateAxes();   // a new state has different temperature ranges
        updateVis();
        addLegend();
    });

    // --- Y dropdown (Category II: encoding change, TMIN vs TMAX) ---
    d3.select('#yVariable')
        .selectAll('option')
        .data(yOptions)
        .enter()
        .append('option')
        .text(d => d)
        .attr('value', d => d);

    d3.select('#yVariable').property('value', yVar);

    d3.select('#yVariable').on('change', function () {
        yVar = d3.select(this).property('value');
        updateAxes();   // switching TMIN/TMAX changes the y-axis scale
        updateVis();
    });

    // --- Date-range slider (Category I: dynamic filter) ---
    // Full date span across the data; the slider starts covering all of it.
    const minDate = d3.min(allData, d => d.date);
    const maxDate = d3.max(allData, d => d.date);
    dateRange = [minDate, maxDate];

    let slider = d3
        .sliderHorizontal()
        .min(minDate)
        .max(maxDate)
        .step(1000 * 60 * 60 * 24)          // one day, in milliseconds
        .width(width - 60)                  // leave room for the 30px offset below
        .default([minDate, maxDate])        // an ARRAY = two handles = a range slider
        .fill('#5b8ff9')                    // color the track between the handles
        .tickFormat(d3.timeFormat('%b %Y')) // show ticks like "Mar 2017"
        .on('onchange', (val) => {
            dateRange = val;   // val is [startDate, endDate]
            updateAxes();      // rescale the x-axis to the chosen window
            updateVis();       // redraw only the lines inside that window
        });

    d3.select('#slider')
        .append('svg')
        .attr('width', width)
        .attr('height', 100)
        .append('g')
        .attr('transform', 'translate(30,30)')
        .call(slider);

    d3.select('#stationSearch').on('input', function () {
        searchTerm = d3.select(this).property('value');
        const term = searchTerm.trim().toLowerCase();

        // Only offer suggestions once something is typed; empty -> no popup
        const matches = term === '' ? [] :
            Array.from(new Set(
                allData
                    .filter(d => d.state === selectedState &&
                                 d.station.toLowerCase().includes(term))
                    .map(d => d.station)
            ));

        const opts = d3.select('#stationOptions')
            .selectAll('option')
            .data(matches, d => d);
        opts.exit().remove();
        opts.enter().append('option').attr('value', d => d);

        applyHighlight();
    });
    
}

function updateAxes(){
    svg.selectAll('.axis').remove()
    svg.selectAll('.labels').remove()

    // X: time scale over the slider's selected date window
    xScale = d3.scaleTime()
        .domain(dateRange)              // [startDate, endDate] from the slider
        .range([0, width]);

    const xAxis = d3.axisBottom(xScale)
        .ticks(6)
        .tickFormat(d3.timeFormat('%b %Y')); // e.g. "Mar 2017"

    svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

    // Y: linear scale over the SELECTED STATE's temperatures (TMIN or TMAX)
    const stateData = allData.filter(d => d.state === selectedState);

    yScale = d3.scaleLinear()
        .domain([
            d3.min(stateData, d => d[yVar]),
            d3.max(stateData, d => d[yVar])
        ])
        .nice()                         // round the ends to tidy numbers
        .range([height, 0]);

    const yAxis = d3.axisLeft(yScale)
        .ticks(6);

    svg.append('g')
        .attr('class', 'axis')
        .call(yAxis);

    // X-axis label
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 20)
        .attr('text-anchor', 'middle')
        .text('Date')
        .attr('class', 'labels');

    // Y-axis label (rotated)
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -margin.left + 40)
        .attr('text-anchor', 'middle')
        .text(`${yVar} (°F)`)
        .attr('class', 'labels');
}

function updateVis(){
   // 1. Filter: selected state AND inside the slider's date window
    const [startDate, endDate] = dateRange;
    const filtered = allData.filter(d =>
        d.state === selectedState &&
        d.date >= startDate &&
        d.date <= endDate
    );

    // 2. Group rows by station -> [ [stationName, pointsArray], ... ]
    const byStation = Array.from(d3.group(filtered, d => d.station));

    // 3. Give each station in this state its own color
    colorScale.domain(byStation.map(d => d[0]));

    // 4. Line generator: date on x, the chosen temperature on y
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d[yVar]));

    // 5. One <path> per station (enter / update / exit, like the lab's circles)
    svg.selectAll('.line')
        .data(byStation, d => d[0])        // key by station name
        .join(
            function(enter){
                return enter
                    .append('path')
                    .attr('class', 'line')
                    .attr('fill', 'none')              // lines aren't filled shapes
                    .attr('stroke', d => colorScale(d[0]))
                    .attr('stroke-width', 1.5)
                    .attr('d', d => line(d[1]))        // d[1] = that station's points
                    .on('mouseover', function (event, d) {
                        const info = d[1][0];
                        d3.select('#tooltip')
                            .style('display', 'block')
                            .html(
                                `<strong>${info.station}</strong><br/>
                                 Lat: ${info.latitude}<br/>
                                 Lon: ${info.longitude}`)
                            .style('left', (event.pageX + 20) + 'px')
                            .style('top', (event.pageY - 28) + 'px');

                        svg.selectAll('.line').style('opacity', 0.1); // fade all lines
                        d3.select(this)
                            .style('opacity', 1)       // bring the hovered one back to full
                            .attr('stroke-width', 4)   // and thicken it
                            .raise();                  // move it in front of the faded ones
                    })
                    .on('mouseout', function (event, d) {
                        d3.select('#tooltip').style('display', 'none');
                        svg.selectAll('.line')
                            .style('opacity', 1)       // restore all lines
                            .attr('stroke-width', 1.5);
                    });
            },
            function(update){
                return update
                    .transition(t)
                    .attr('stroke', d => colorScale(d[0]))
                    .attr('d', d => line(d[1]));
            },
            function(exit){
                return exit.remove();
            }
        );


}

function addLegend(){
 // Stations in the selected state — same set the lines use
    const uniqueStations = Array.from(
        new Set(allData.filter(d => d.state === selectedState).map(d => d.station))
    );

    // Bind stations to legend rows (keyed by name so state switches update cleanly)
    const items = d3.select('#legend')
        .selectAll('.legend-item')
        .data(uniqueStations, d => d);

    items.exit().remove();

    const entered = items.enter()
        .append('div')
        .attr('class', 'legend-item');

    entered.append('span').attr('class', 'legend-swatch');
    entered.append('span').attr('class', 'legend-label');

    // Set color + text on all current rows
    const merged = entered.merge(items);
    merged.select('.legend-swatch').style('background-color', d => colorScale(d));
    merged.select('.legend-label').text(d => d);

}

function applyHighlight(){
    const term = searchTerm.trim().toLowerCase();

    // Show only matching lines; hide the rest entirely
    svg.selectAll('.line')
        .style('display', d => {
            if (term === '') return null;                     // nothing typed -> show all
            return d[0].toLowerCase().includes(term) ? null : 'none';
        });

    // Legend: fade non-matches so the active station stands out (names stay readable)
    d3.select('#legend').selectAll('.legend-item')
        .style('opacity', d => {
            if (term === '') return 1;
            return d.toLowerCase().includes(term) ? 1 : 0.3;
        });
}

window.addEventListener('load', init);