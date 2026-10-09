namespace Interop;

/// <summary>Static members called from Bun.</summary>
public static class Calc
{
    public static int Add(int a, int b) => a + b;

    public static async Task<string> EchoAsync(string text)
    {
        await Task.Delay(10);
        return text + "!";
    }

    public static int Apply(Func<int, int> callback, int value) => callback(value);
}

/// <summary>Instance members and a .NET event forwarded to a JS callback.</summary>
public class Counter
{
    public Counter(int start) => Value = start;

    public int Value { get; private set; }

    public event EventHandler<int>? Changed;

    public void Increment()
    {
        Value++;
        Changed?.Invoke(this, Value);
    }

    public void OnChanged(Action<int> listener) => Changed += (_, value) => listener(value);
}
