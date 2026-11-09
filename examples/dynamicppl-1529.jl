using DynamicPPL, Distributions, Random, TOML

@model function readings(y)
    mu ~ Normal()
    for i in eachindex(y)
        y[i] ~ Normal(mu, 1)
    end
    return y
end

model = readings([1.0, 2.0])
changed = condition(model; y=[1.0, 3.0])
partial = decondition(model, @varname(y[2]))
fixed = fix(decondition(model, :y); y=[1.0, 2.0])
TOML.print(Dict(
    "julia" => string(VERSION),
    "condition_return" => changed(Xoshiro(1)),
    "condition_likelihood" => loglikelihood(changed, (mu=0.0,)),
    "partial_return" => partial(Xoshiro(1)),
    "original_return" => model(Xoshiro(1)),
    "fixed_likelihood" => loglikelihood(fixed, (mu=0.0,)),
); sorted=true)
