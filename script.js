document.addEventListener("DOMContentLoaded", function () {
  const tableBody = document.querySelector("#dynamicTable tbody");
  let selectedCell = null; // Track the selected cell

  // Add more rows
  document.getElementById("addRowBtn").addEventListener("click", function () {
    const newRow = document.createElement("tr");
    newRow.innerHTML = `
    <td><input type="text" class="from"></td>
    <td><input type="text" class="to"></td>
    <td><input type="number" step="0.01" class="amount"></td>
    <td class="generated"></td>
  `;
    tableBody.appendChild(newRow);
  });

  // Highlight selected cell
  tableBody.addEventListener("click", function (e) {
    if (e.target.tagName === "INPUT") {
      // Clear previous selection
      if (selectedCell) {
        selectedCell.parentElement.classList.remove("selected");
      }

      // Highlight current selection
      selectedCell = e.target;
      selectedCell.parentElement.classList.add("selected");
    }
  });

  // Handle pasting data from Excel or clipboard
  tableBody.addEventListener("paste", function (e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData("text/plain").trim();
    const rows = pastedData.split("\n").map((row) => row.split("\t"));

    if (!selectedCell) return; // No cell selected

    const startRow = Array.from(tableBody.rows).indexOf(
      selectedCell.parentElement.parentElement
    );
    const startCol = Array.from(
      selectedCell.parentElement.parentElement.cells
    ).indexOf(selectedCell.parentElement);

    rows.forEach((rowData, rowIndex) => {
      const tableRow = tableBody.rows[startRow + rowIndex];
      if (tableRow) {
        rowData.forEach((cellData, colIndex) => {
          const cell = tableRow.cells[startCol + colIndex];
          if (cell) {
            const input = cell.querySelector("input");
            if (input) input.value = cellData.trim();
            autoGenerate(input); // Trigger auto-generate after pasting
          }
        });
      }
    });

    e.preventDefault(); // Prevent default paste behavior
  });

  // Auto-generate Column D
  function autoGenerate(inputCell) {
    const row = inputCell.parentElement.parentElement; // Get the parent row
    const from = row.querySelector(".from").value;
    const to = row.querySelector(".to").value;
    const amount = row.querySelector(".amount").value;
    const generatedCell = row.querySelector(".generated");

    if (from && to && amount) {
      generatedCell.textContent = `${from} [${amount}] ${to}`;
    } else {
      generatedCell.textContent = ""; // Clear if incomplete
    }
  }

  // Trigger auto-generate on input
  tableBody.addEventListener("input", function (e) {
    if (e.target.tagName === "INPUT") {
      autoGenerate(e.target);
    }
  });
});
