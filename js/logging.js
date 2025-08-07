function consoleLogTime(...args) {
    // Create a new Date object
    const now = new Date();

    // Get individual components of the date and time
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    // Format the date and time as a string
    const currentTime = `${month}-${day} ${hours}:${minutes}:${seconds}`;
    // Prepend the current time to the log message
    console.log(currentTime, ...args);
}
