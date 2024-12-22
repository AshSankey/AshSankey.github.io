document.addEventListener("DOMContentLoaded", function () {
  const tableBody = document.querySelector("#dynamicTable tbody");
  let selectedCell = null; // Track the selected cell

  // Add more rows
  document.getElementById("addRowBtn")?.addEventListener("click", function () {
    const newRow = document.createElement("tr");
    newRow.innerHTML = `
      <td><input type="text" class="from"></td>
      <td><input type="text" class="to"></td>
      <td><input type="number" step="0.0000000001" class="amount"></td>
      <td class="generated"></td>
    `;
    tableBody.appendChild(newRow);

    // Add fade-in animation and highlight
    newRow.classList.add("fade-in", "highlight");
    tableBody.appendChild(newRow);

    // Remove highlight after 1.5 seconds
    setTimeout(() => newRow.classList.remove("highlight"), 1500);

    // Auto-scroll to the new row
    newRow.scrollIntoView({ behavior: "smooth", block: "center" });
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
            if (input) {
              if (input.type === "number") {
                const numericValue = parseFloat(cellData.trim());
                if (!isNaN(numericValue)) {
                  input.value = numericValue;

                  // Trigger both 'input' and 'change' events
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                }
              } else {
                input.value = cellData.trim();

                // Trigger both 'input' and 'change' events
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
          }
        });
      }
    });

    e.preventDefault(); // Prevent default paste behavior
  });

  // Auto-generate logic
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
    if (
      e.target.tagName === "INPUT" &&
      !e.target.classList.contains("colorPicker")
    ) {
      autoGenerate(e.target);
    }
  });

  // Enable keyboard navigation
  tableBody.addEventListener("keydown", function (e) {
    const inputs = Array.from(tableBody.querySelectorAll("input"));
    const currentIndex = inputs.indexOf(e.target);

    if (currentIndex !== -1) {
      let nextIndex = -1;

      if (e.key === "ArrowRight" || e.key === "Tab") {
        nextIndex = currentIndex + 1;
      } else if (e.key === "ArrowLeft") {
        nextIndex = currentIndex - 1;
      } else if (e.key === "ArrowDown") {
        nextIndex = currentIndex + 3; // Assuming 3 columns
      } else if (e.key === "ArrowUp") {
        nextIndex = currentIndex - 3; // Assuming 3 columns
      }

      if (nextIndex >= 0 && nextIndex < inputs.length) {
        inputs[nextIndex].focus();
        e.preventDefault(); // Prevent default tabbing behavior
      }
    }
  });
});

// Option 1: Redirect to a specific page
function option1() {
  window.location.href = "/mobile-patent-suits/mobile.html";
}

// Option 2: Redirect to a specific page
function option2() {
  window.location.href = "/Tree.html";
}


// Option 3: Redirect to a specific page
function option3() {
  window.location.href = "/sunburst.html";
}
