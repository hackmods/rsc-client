function compactAmount(amount) {
    const divisor = amount >= 1000000 ? 1000000 : amount >= 1000 ? 1000 : 0;
    if (!divisor) return amount.toString();
    // Truncate rather than round so a label never promises more items.
    return `${Math.floor(amount / divisor * 10) / 10}${divisor === 1000000 ? 'M' : 'K'}`;
}

function formatWithCommas(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = { compactAmount, formatWithCommas };
