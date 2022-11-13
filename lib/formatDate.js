const zeroFill = (num) => {
  const str = num + "";
  return str.length === 1 ? str.padStart(2, 0) : str;
};

const formatDate = (dateString) => {
  const d = new Date(dateString);

  const [day, month, year, hrs, mins, secs] = [
    d.getDate(),
    d.getMonth() + 1,
    d.getFullYear(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ].map((p) => zeroFill(p));

  return `${day}.${month}.${year} ${hrs}:${mins}:${secs}`;
};

module.exports = formatDate;
