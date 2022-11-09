const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',

    // These options are needed to round to whole numbers if that's what you want.
    //minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
    //maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
  });

function age_objects(data, percent) {
    var new_data = {0: 0, 366: 0};
    for (const [key, value] of Object.entries(data)) {
        // console.log(`${key}: ${value}`);
        let k = parseInt(key);
        new_data[0] += Math.round(value * percent);
        let n = k + 30;
        if (n > 365) {
            new_data[366] += Math.round(value * (1 - percent));
        } else {
            new_data[n] = Math.round(value * (1 - percent));
        }
    }
    return new_data;
}

function get_cost(data, object_size) {
    const standard = 0.02
    const nearline = 0.01
    const coldline = 0.004
    const archive = 0.0012

    var cost = 0.0;

    // get object cost
    for (const [k, value] of Object.entries(data)) {
        if (k <= 30) {
            cost += standard * value * object_size;
        } else if (k <= 90) {
            cost += nearline * value * object_size;
        } else if (k <= 365) {
            cost += coldline * value * object_size;
        } else {
            cost += archive * value * object_size;
        }
    }

    // get autoclass cost
    const num = num_objects(data);
    cost += num / 100000 * .25;

    return cost;
}

function num_objects(data) {
    var num = 0;
    for (const value of Object.values(data)) {
        num += value;
    }
    return num;
}

function estimate() {
    const objects = parseInt(document.getElementById("objects").value);
    const new_objects = parseInt(document.getElementById("new-objects").value);
    const object_size = parseFloat(document.getElementById("object-size").value);
    const percent_accessed = parseFloat(document.getElementById("percent-accessed").value);
    const percent = percent_accessed / 100.0;
    console.log("Objects: " + objects);
    console.log("New Objects per Month: " + new_objects);
    console.log("Average Object Size in GB: " + object_size);
    console.log("Objects Accessed per Month: " + percent_accessed + "% (" + percent + "x)");

    // initialize the data
    var data = {
        0: objects,
    }
    // console.log(data);

    var month = 0;
    var output = "";
    while (month < 24) {
        month += 1;
        // age all the objects 30 days
        data = age_objects(data, percent);
        // console.log(data);
        // add new objects for this month
        data["0"] += new_objects;
        // get number of objects
        let num = num_objects(data);
        let cost = get_cost(data, object_size);
        let cost_string = Number(cost.toFixed(2)).toLocaleString();
        let bucket_size = (num * object_size).toFixed(2);
        let month_output = "Month " + month + " cost: $" + cost_string + " (" + num + " objects, " + bucket_size + " GB)";
        console.log(month_output);
        output += month_output + "<br>\n";
    }

    var div = document.getElementById("output");
    div.innerHTML = output;
}