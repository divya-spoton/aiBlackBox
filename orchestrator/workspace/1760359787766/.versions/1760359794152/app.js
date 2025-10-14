// Fetch buy orderbook from API
fetch('https://api.example.com/buyOrderbook')
.then(response => response.json())
.then(data => {
  const buyOrderbook = document.getElementById('buyOrderbook');
  data.forEach(order => {
    const li = document.createElement('li');
    li.textContent = `${order.price} - ${order.quantity}`;
    buyOrderbook.appendChild(li);
  });
})
.catch(error => console.error('Error fetching buy orderbook:', error));

// Fetch sell orderbook from API
fetch('https://api.example.com/sellOrderbook')
.then(response => response.json())
.then(data => {
  const sellOrderbook = document.getElementById('sellOrderbook');
  data.forEach(order => {
    const li = document.createElement('li');
    li.textContent = `${order.price} - ${order.quantity}`;
    sellOrderbook.appendChild(li);
  });
})
.catch(error => console.error('Error fetching sell orderbook:', error));

// Fetch number of trades executed today
fetch('https://api.example.com/numTrades')
.then(response => response.json())
.then(data => {
  const numTrades = document.getElementById('numTrades');
  numTrades.textContent = data;
})
.catch(error => console.error('Error fetching number of trades:', error);