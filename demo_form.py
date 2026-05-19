import tkinter as tk
from tkinter import ttk, messagebox

root = tk.Tk()
root.title("AgentFarm - Employee Onboarding Form")
root.geometry("520x440")
root.configure(bg="#1a1a2e")
root.resizable(False, False)

style = ttk.Style()
style.theme_use("clam")
style.configure("TLabel", background="#1a1a2e", foreground="#e0e0ff", font=("Arial", 11))
style.configure("TEntry", fieldbackground="#16213e", foreground="#ffffff", font=("Arial", 11))
style.configure("TButton", background="#0f3460", foreground="#ffffff", font=("Arial", 11, "bold"), padding=8)
style.configure("TCombobox", fieldbackground="#16213e", foreground="#ffffff", font=("Arial", 11))

title = tk.Label(root, text="Employee Onboarding Form", bg="#0f3460", fg="#ffffff",
                 font=("Arial", 14, "bold"), pady=12)
title.pack(fill=tk.X)

frame = tk.Frame(root, bg="#1a1a2e", padx=30, pady=20)
frame.pack(fill=tk.BOTH, expand=True)

fields = [
    ("Full Name:", "entry"),
    ("Email Address:", "entry"),
    ("Job Title:", "entry"),
    ("Department:", "combo"),
    ("Start Date:", "entry"),
]

widgets = {}
for i, (label, ftype) in enumerate(fields):
    ttk.Label(frame, text=label).grid(row=i, column=0, sticky="w", pady=8)
    if ftype == "entry":
        w = ttk.Entry(frame, width=30)
    else:
        w = ttk.Combobox(frame, width=28, values=["Engineering", "Sales", "Marketing", "HR", "Finance"])
    w.grid(row=i, column=1, sticky="w", padx=(16, 0))
    widgets[label] = w

def submit():
    name = widgets["Full Name:"].get()
    messagebox.showinfo("Submitted!", f"Welcome aboard, {name}!\nOnboarding complete.")

btn = ttk.Button(frame, text="Submit Onboarding", command=submit)
btn.grid(row=len(fields), column=0, columnspan=2, pady=20)

root.mainloop()
