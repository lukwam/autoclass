"""Autoclass calculator."""

# percent_active = 0.10
# objects = 191392215
# monthly_objects = 1000000
# size_gb = 0.0135324208

percent_active = 0.10
objects = 10000000
monthly_objects = 100000
size_gb = 0.100

standard = 0.02
nearline = 0.01
coldline = 0.004
archive = 0.0012


def age_objects(data):
    new_data = {0: 0, 366: 0}
    for k, v in data.items():
        new_data[0] += v * percent_active
        n = k + 30
        if n > 365:
            new_data[366] += v * (1 - percent_active)
        else:
            new_data[n] = v * (1 - percent_active)
    return new_data


def get_cost(data):
    cost = 0

    for k, v in data.items():
        if k <= 30:
            cost += standard * v * size_gb
        elif k <= 90:
            cost += nearline * v * size_gb
        elif k <= 365:
            cost += coldline * v * size_gb
        else:
            cost += archive * v * size_gb

    # get autoclass cost
    num = num_objects(data)

    cost += num / 100000 * .25

    return round(cost, 2)


def num_objects(data):
    num = 0
    for v in data.values():
        num += v
    return round(num)


def main():
    """Main function."""
    total_gb = objects * size_gb
    autoclass_monthly = objects / 100000 * 0.25
    standard_monthly = total_gb * standard
    print(f"Average Object Size: {size_gb:,} GB")
    print(f"Objects: {objects:,}")
    print(f"Total Bucket Size: {total_gb:,} GB")
    print(f"Monthly Cost (Standard): ${standard_monthly:,}")
    print(f"Monthly Autoclass Cost: ${autoclass_monthly:,}")
    print(f"New Objects Created Per Month: {monthly_objects:,}")
    print(f"Percent of Objects Accessed Each Month: {percent_active * 100}%\n")

    data = {
        0: objects,
    }

    month = 0
    # num = num_objects(data)
    # print(f"\nMonth {month} cost: ${get_cost(data):,} ({num} objects)")

    while month < 24:
        month += 1
        data = age_objects(data)
        data[0] += monthly_objects
        # print(data)
        num = num_objects(data)
        print(f"Month {month} cost: ${get_cost(data):,} ({num} objects) - standard: ${round(num * size_gb * standard, 2):,}")



if __name__ == "__main__":
    main()
